/**
 * NextAuth v5 (beta.31) — Unified auth configuration.
 *
 * Since Next.js 16 proxy.ts runs in Node.js runtime (not Edge),
 * we no longer need a split config. All auth logic lives here.
 *
 * @see docs/decisions/0002-auth-strategy.md
 * @see docs/decisions/0003-nextjs-16-migration.md
 */
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { createHash } from "node:crypto";
import { compare } from "bcryptjs";
import { hashPassword } from "@/lib/password";
import { resolveLoginIdentifier, maskIdentifier } from "@/lib/auth/login-identifier";
import { withAdmin } from "@/server/db";
import { checkRateLimit, recordFailedAttempt, clearRateLimit } from "@/lib/utils/rate-limit";
import { logger } from "@/lib/logger";
import { allowedModulesForTenant, type ModuleKey } from "@/lib/modules";
import { decryptSecret, verifyTotp } from "@/lib/auth/two-factor";
import { consumeBackupCodeAtomic } from "@/server/services/backup-code.service";
import { TwoFactorRequiredError, TwoFactorInvalidError } from "@/lib/auth/two-factor-errors";
import { RateLimitedError } from "@/lib/auth/login-errors";

/**
 * Resolve os módulos liberados por tenant (gating por plano), com cache em
 * processo de curta duração. Permite que a mudança de plano no admin reflita em
 * sessões existentes em ~MODULES_CACHE_TTL_MS, sem exigir relogin e sem bater no
 * banco a cada request. (Decisão do dono: "JWT + invalidar ao mudar plano".)
 */
// A6 (anti-enumeração): hash dummy (mesmo custo do app) comparado quando o
// usuário não existe, para o tempo de resposta do login não revelar se o
// identificador existe. Computado uma vez no boot.
const DUMMY_PASSWORD_HASH = hashPassword("nonexistent-user-timing-equalizer");

const MODULES_CACHE_TTL_MS = 60_000;
const modulesCache = new Map<string, { modules: ModuleKey[]; expiresAt: number }>();
const ACTIVE_TENANT_STATUS = "ACTIVE";
const USER_SECURITY_CACHE_TTL_MS = 15_000;
type UserSecurity = { mustChangePassword: boolean; pwdSig: string };
const userSecurityCache = new Map<string, UserSecurity & { expiresAt: number }>();

/**
 * A5: fingerprint do passwordHash (não reversível, não expõe o hash). Muda quando
 * a senha muda → o refresh do JWT compara e INVALIDA sessões antigas após
 * troca/reset de senha, fechando a janela de 7d em que a sessão de um atacante
 * sobreviveria a um reset de recuperação. Sem migration (deriva do hash existente).
 */
function passwordFingerprint(passwordHash: string): string {
  return createHash("sha256").update(passwordHash).digest("hex").slice(0, 16);
}

/**
 * Estado de segurança do usuário (mustChangePassword + fingerprint da senha), com
 * cache de curta duração. Re-checado no refresh do JWT.
 */
async function resolveUserSecurity(userId: string): Promise<UserSecurity> {
  const now = Date.now();
  const cached = userSecurityCache.get(userId);
  if (cached && cached.expiresAt > now) {
    return { mustChangePassword: cached.mustChangePassword, pwdSig: cached.pwdSig };
  }

  const user = await withAdmin((tx) =>
    tx.user.findUnique({
      where: { id: userId },
      select: { mustChangePassword: true, passwordHash: true },
    }),
  );
  const sec: UserSecurity = {
    mustChangePassword: user?.mustChangePassword === true,
    pwdSig: user ? passwordFingerprint(user.passwordHash) : "",
  };
  userSecurityCache.set(userId, { ...sec, expiresAt: now + USER_SECURITY_CACHE_TTL_MS });
  return sec;
}

/**
 * Membership atual do usuário (tenants ativos + papel + flags), com cache de
 * curta duração. Usado no REFRESH do JWT para que remover um usuário de um
 * tenant OU rebaixar seu papel (admin→operator) surta efeito em ~TTL, sem
 * esperar a expiração do token (7d) e sem relogin (S1/A2). Antes o refresh só
 * re-resolvia módulos, mantendo role/membership congelados do login.
 */
const MEMBERSHIP_CACHE_TTL_MS = 30_000;
type MembershipTenant = {
  id: string;
  slug: string;
  name: string;
  plan: string | null;
  status: string;
  role: string;
  isTechnician: boolean;
};
const membershipCache = new Map<string, { tenants: MembershipTenant[]; expiresAt: number }>();

function primeMembershipCache(userId: string, tenants: MembershipTenant[]): void {
  membershipCache.set(userId, { tenants, expiresAt: Date.now() + MEMBERSHIP_CACHE_TTL_MS });
}

async function resolveMembership(userId: string): Promise<MembershipTenant[]> {
  const now = Date.now();
  const cached = membershipCache.get(userId);
  if (cached && cached.expiresAt > now) return cached.tenants;

  const rows = await withAdmin((tx) =>
    tx.userTenant.findMany({
      where: { userId, tenant: { status: ACTIVE_TENANT_STATUS } },
      include: {
        tenant: { select: { id: true, slug: true, name: true, plan: true, status: true } },
      },
    }),
  );
  const tenants: MembershipTenant[] = rows.map((ut) => ({
    id: ut.tenant.id,
    slug: ut.tenant.slug,
    name: ut.tenant.name,
    plan: ut.tenant.plan,
    status: ut.tenant.status,
    role: ut.role,
    isTechnician: ut.isTechnician,
  }));
  membershipCache.set(userId, { tenants, expiresAt: now + MEMBERSHIP_CACHE_TTL_MS });
  return tenants;
}

async function resolveModulesByTenant(
  tenants: Array<{ id: string; slug: string; plan: string | null; status?: string }>,
  opts?: { withPlan?: boolean },
): Promise<Map<string, ModuleKey[]>> {
  const result = new Map<string, ModuleKey[]>();
  const now = Date.now();

  // Quais tenants precisam de consulta (cache expirado/ausente)?
  const stale = tenants.filter((t) => {
    if (opts?.withPlan) return true;
    const cached = modulesCache.get(t.id);
    if (cached && cached.expiresAt > now) {
      result.set(t.id, cached.modules);
      return false;
    }
    return true;
  });

  if (stale.length > 0) {
    const data = await withAdmin(async (tx) => {
      // Quando chamado em requisições subsequentes, não temos o plano no token:
      // buscamos tenant.plan no banco. No login já temos, mas reconsultar é
      // barato e mantém uma única fonte de verdade.
      // cnpj entra no select para inferir NO-KYC (sem documento → teto wallet).
      // Buscamos sempre no banco (mesmo sem withPlan): o token não carrega cnpj
      // e o reforço de gating do NO-KYC não pode depender só do plano.
      const dbTenants = await tx.tenant.findMany({
        where: { id: { in: stale.map((t) => t.id) } },
        select: { id: true, slug: true, plan: true, status: true, cnpj: true, apiAccessEnabled: true },
      });

      const activeTenants = dbTenants.filter(
        (t) => !("status" in t) || t.status === ACTIVE_TENANT_STATUS,
      );

      // Fonte canônica do plano: a Subscription não-cancelada (ACTIVE ou PAST_DUE
      // — em carência ainda concede acesso). O corte de fato (SUSPENDED/CANCELLED)
      // já ocorre no login via Tenant.status. `Tenant.plan` (sombra) é só fallback
      // para o legado ainda sem Subscription durante a transição.
      const subscriptions = activeTenants.length
        ? await tx.subscription.findMany({
            where: {
              tenantId: { in: activeTenants.map((t) => t.id) },
              status: { in: ["ACTIVE", "PAST_DUE"] },
            },
            select: { tenantId: true, plan: { select: { features: true } } },
          })
        : [];
      const subFeaturesByTenantId = new Map(
        subscriptions.map((s) => [s.tenantId, s.plan.features]),
      );

      // Fallback: só busca Plan por `Tenant.plan` para tenants sem Subscription.
      const fallbackPlanIds = Array.from(
        new Set(
          activeTenants
            .filter((t) => !subFeaturesByTenantId.has(t.id) && t.plan)
            .map((t) => t.plan)
            .filter((p): p is string => Boolean(p)),
        ),
      );
      const fallbackPlans = fallbackPlanIds.length
        ? await tx.plan.findMany({
            where: { id: { in: fallbackPlanIds } },
            select: { id: true, features: true },
          })
        : [];
      const fallbackFeaturesByPlanId = new Map(fallbackPlans.map((p) => [p.id, p.features]));
      return { dbTenants: activeTenants, subFeaturesByTenantId, fallbackFeaturesByPlanId };
    });

    for (const t of data.dbTenants) {
      // Plano canônico via Subscription; fallback ao Tenant.plan (sombra) só para
      // legado ainda sem Subscription. `hasPlan` reflete a fonte efetiva.
      const hasSubscription = data.subFeaturesByTenantId.has(t.id);
      const planFeatures = hasSubscription
        ? data.subFeaturesByTenantId.get(t.id) ?? null
        : t.plan
          ? data.fallbackFeaturesByPlanId.get(t.plan) ?? null
          : null;

      const modules = allowedModulesForTenant({
        tenantSlug: t.slug,
        hasPlan: hasSubscription || Boolean(t.plan),
        planFeatures,
        // Tipo inferido pela presença de documento (ADR 0050): sem CNPJ = NO-KYC.
        isNoKyc: !t.cnpj,
        // Override por-tenant da API externa (ADR 0057).
        apiAccessEnabled: t.apiAccessEnabled === true,
      });
      modulesCache.set(t.id, { modules, expiresAt: now + MODULES_CACHE_TTL_MS });
      result.set(t.id, modules);
    }
  }

  return result;
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  // Multi-dominio: usa o host da requisicao (pdvdepix.app, arenatechpi, etc)
  // para montar callbacks/redirects, em vez do NEXTAUTH_URL fixo. Sem isso,
  // logins em pdvdepix.app redirecionariam para app.arenatechpi.com.br.
  trustHost: true,

  // Sessao JWT expira em 7 dias. Tokens roubados/vazados nao duram para sempre.
  // Atividade renova (updateAge: 1 dia) para nao deslogar usuarios ativos.
  session: { strategy: "jwt", maxAge: 7 * 24 * 60 * 60, updateAge: 24 * 60 * 60 },

  pages: {
    signIn: "/login",
    error: "/login",
  },

  providers: [
    Credentials({
      credentials: {
        // Campo único: CPF (tenant KYC) ou e-mail (tenant NO-KYC) — ADR 0050.
        // Mantém a key `cpf` por compatibilidade com o loginAction/cliente.
        cpf: { label: "CPF ou e-mail", type: "text" },
        password: { label: "Senha", type: "password" },
        totp: { label: "Código 2FA", type: "text" },
      },
      async authorize(credentials) {
        // Login dual: se contém "@" é e-mail (NO-KYC), senão CPF (KYC).
        const identifier = resolveLoginIdentifier(credentials?.cpf);
        if (!identifier) return null;

        const password = credentials?.password;
        if (typeof password !== "string" || !password) return null;

        // Rate limit por identificador (5 tentativas / 15min → lockout 15min).
        const rateLimitKey = `login:${identifier.kind}:${identifier.value}`;
        const limitCheck = checkRateLimit(rateLimitKey);
        if (!limitCheck.allowed) {
          const minutes = Math.ceil(limitCheck.retryAfterMs / 60000);
          logger.warn("Login bloqueado por rate limit", {
            kind: identifier.kind,
            id: maskIdentifier(identifier),
            retryAfterMin: minutes,
          });
          // AuthError tipado → loginAction mostra mensagem amigável (não crasha).
          throw new RateLimitedError(minutes);
        }

        // cpf/email são únicos PARCIAIS no banco (ADR 0050), não @unique p/ o
        // Prisma → findFirst pelo campo do identificador resolvido.
        const where = identifier.kind === "cpf" ? { cpf: identifier.value } : { email: identifier.value };
        const user = await withAdmin(async (tx) => {
          return tx.user.findFirst({ where });
        });

        if (!user) {
          // A6: compara contra o hash dummy (async, mesmo custo) para equalizar o
          // tempo de resposta — sem isto, "usuário inexistente" falharia rápido e
          // vazaria a existência do identificador por timing.
          await compare(password, DUMMY_PASSWORD_HASH);
          recordFailedAttempt(rateLimitKey);
          return null;
        }
        if (!(await compare(password, user.passwordHash))) {
          const updated = recordFailedAttempt(rateLimitKey);
          logger.warn("Login falhou: senha incorreta", {
            kind: identifier.kind,
            id: maskIdentifier(identifier),
            remaining: updated.remainingAttempts,
          });
          return null;
        }

        // Senha OK. Se o usuário tem 2FA, exige um código válido antes da sessão.
        if (user.twoFactorEnabled && user.twoFactorSecret) {
          const totp = typeof credentials?.totp === "string" ? credentials.totp.trim() : "";
          if (!totp) {
            // Senha certa, mas falta o código — sinaliza ao loginAction (sem
            // contar como falha de senha).
            throw new TwoFactorRequiredError();
          }
          // Decifrar pode estourar se o segredo estiver corrompido/sem a chave
          // certa (ex.: rotação do NEXTAUTH_SECRET). Tratamos como código inválido
          // em vez de derrubar o login — recuperação é via reset do 2FA.
          let secret: string;
          try {
            secret = decryptSecret(user.twoFactorSecret);
          } catch (err) {
            logger.error("2FA: falha ao decifrar segredo — tratando como inválido", {
              userId: user.id,
              error: err instanceof Error ? err.message : String(err),
            });
            recordFailedAttempt(rateLimitKey);
            throw new TwoFactorInvalidError();
          }
          if (verifyTotp(secret, totp)) {
            clearRateLimit(rateLimitKey);
          } else {
            // Tenta backup code (uso único) — consumido ATOMICAMENTE (anti-replay).
            const consumed = await withAdmin((tx) => consumeBackupCodeAtomic(tx, user.id, totp));
            if (!consumed) {
              recordFailedAttempt(rateLimitKey);
              throw new TwoFactorInvalidError();
            }
            clearRateLimit(rateLimitKey);
            logger.info("Login: backup code 2FA usado", { userId: user.id });
          }
        } else {
          // Sem 2FA — limpa contador no sucesso.
          clearRateLimit(rateLimitKey);
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          cpf: user.cpf,
          isSuperAdmin: user.isSuperAdmin,
          mustChangePassword: user.mustChangePassword,
          // A5: fingerprint da senha no momento do login — o refresh invalida a
          // sessão se a senha mudar (troca/reset).
          pwdSig: passwordFingerprint(user.passwordHash),
        };
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user }) {
      try {
        // First call after login — populate token with user data + tenants
        if (user) {
          token.id = user.id!;
          token.cpf = (user as { cpf: string | null }).cpf;
          token.isSuperAdmin = (user as { isSuperAdmin: boolean }).isSuperAdmin;
          token.mustChangePassword = (user as { mustChangePassword: boolean }).mustChangePassword;
          token.pwdSig = (user as { pwdSig?: string }).pwdSig;

          const userTenants = await withAdmin(async (tx) => {
            return tx.userTenant.findMany({
              where: {
                userId: user.id!,
                tenant: { status: ACTIVE_TENANT_STATUS },
              },
              include: {
                tenant: { select: { id: true, slug: true, name: true, plan: true, status: true } },
              },
            });
          });

          const modulesByTenantId = await resolveModulesByTenant(
            userTenants.map((ut) => ({
              slug: ut.tenant.slug,
              plan: ut.tenant.plan,
              id: ut.tenant.id,
              status: ut.tenant.status,
            })),
          );

          token.availableTenants = userTenants.map((ut) => ({
            id: ut.tenant.id,
            slug: ut.tenant.slug,
            name: ut.tenant.name,
            role: ut.role,
            isTechnician: ut.isTechnician,
            modules: modulesByTenantId.get(ut.tenant.id) ?? [],
          }));

          // Prime o cache de membership para o 1º refresh não re-consultar de imediato.
          primeMembershipCache(
            user.id!,
            userTenants.map((ut) => ({
              id: ut.tenant.id,
              slug: ut.tenant.slug,
              name: ut.tenant.name,
              plan: ut.tenant.plan,
              status: ut.tenant.status,
              role: ut.role,
              isTechnician: ut.isTechnician,
            })),
          );

          token.activeTenantId = userTenants.length === 1 ? userTenants[0]!.tenant.id : null;
          token.impersonatedTenantId = null;
        } else if (typeof token.id === "string") {
          const sec = await resolveUserSecurity(token.id);
          token.mustChangePassword = sec.mustChangePassword;
          // A5: se a senha mudou desde a emissão do token (fingerprint diverge),
          // invalida a sessão — força re-login após troca/reset de senha, fechando
          // a janela em que a sessão de um atacante sobreviveria a um reset.
          if (typeof token.pwdSig === "string" && token.pwdSig && token.pwdSig !== sec.pwdSig) {
            logger.info("Sessao invalidada — senha alterada desde a emissao do token", {
              userId: token.id,
            });
            return null;
          }

          // Refresh (sem `user`, roda em TODA navegação via proxy): re-checa
          // membership + papel no banco (cache TTL curto) E re-resolve os módulos
          // por plano. Assim, remover o usuário de um tenant OU rebaixar
          // admin→operator surte efeito em ~TTL — inclusive nas procedures
          // sensíveis (saque DePix) que leem role/membership da sessão. Antes só
          // os módulos eram re-resolvidos, deixando role/membership congelados do
          // login até a expiração do JWT (7d). Também reflete troca de plano
          // (withPlan:true) como antes.
          const membership = await resolveMembership(token.id);
          const modulesByTenantId = await resolveModulesByTenant(
            membership.map((t) => ({ slug: t.slug, plan: t.plan, id: t.id, status: t.status })),
            { withPlan: true },
          );
          token.availableTenants = membership
            .filter((t) => modulesByTenantId.has(t.id))
            .map((t) => ({
              id: t.id,
              slug: t.slug,
              name: t.name,
              role: t.role,
              isTechnician: t.isTechnician,
              modules: modulesByTenantId.get(t.id) ?? [],
            }));

          if (
            typeof token.activeTenantId === "string" &&
            !token.availableTenants.some((t) => t.id === token.activeTenantId)
          ) {
            token.activeTenantId = null;
          }
        }

        return token;
      } catch (error) {
        // Caminho de LOGIN (user presente): deixa o erro subir — o loginAction
        // trata e mostra mensagem amigável.
        if (user) throw error;
        // Caminho de REFRESH (sem user, roda em TODA navegação via proxy): uma
        // falha de banco aqui NÃO pode derrubar a navegação para o error boundary
        // ("Algo deu errado"). Degrada mantendo o token atual (módulos/tenants do
        // último refresh) — o cache/TTL já pressupõe essa tolerância.
        logger.error("jwt refresh falhou — mantendo token atual", {
          error: error instanceof Error ? error.message : String(error),
        });
        return token;
      }
    },

    async session({ session, token }) {
      session.user.id = token.id as string;
      session.user.cpf = (token.cpf as string | null) ?? null;
      session.user.isSuperAdmin = token.isSuperAdmin as boolean;
      session.user.mustChangePassword = token.mustChangePassword === true;
      session.activeTenantId = (token.activeTenantId as string) ?? null;
      session.impersonatedTenantId = (token.impersonatedTenantId as string) ?? null;
      session.availableTenants =
        (token.availableTenants as Array<{
          id: string;
          slug: string;
          name: string;
          role: string;
          isTechnician?: boolean;
          modules: string[];
        }>) ?? [];
      return session;
    },

    authorized() {
      // Route protection handled by proxy.ts — always allow here
      return true;
    },

    /**
     * Multi-dominio: NextAuth monta `baseUrl` a partir do NEXTAUTH_URL fixo
     * (= app.arenatechpi). Sem este callback, um login em pdvdepix.app
     * redirecionava para o arenatechpi. Aqui forcamos URLs do MESMO host da
     * requisicao: relativas passam direto; absolutas so passam se forem do
     * proprio host (caso contrario caem para a raiz relativa).
     */
    redirect({ url, baseUrl }) {
      // Caminho relativo ("/painel", "/login?...") — mantem no host atual.
      if (url.startsWith("/")) return url;
      try {
        const target = new URL(url);
        const base = new URL(baseUrl);
        // Mesmo host do baseUrl que o NextAuth resolveu — ok.
        if (target.host === base.host) return url;
        // Host diferente (ex: vazando p/ arenatechpi): descarta o host,
        // preserva apenas o path+query no host atual.
        logger.warn("Auth redirect: host descartado — possível misconfiguration", {
          targetHost: target.host,
          baseHost: base.host,
          url,
        });
        return `${target.pathname}${target.search}` || "/";
      } catch {
        return "/";
      }
    },
  },
});
