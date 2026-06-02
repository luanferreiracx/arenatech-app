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
import { compareSync } from "bcryptjs";
import { cpfSchema } from "@/lib/validators/cpf";
import { withAdmin } from "@/server/db";
import { checkRateLimit, recordFailedAttempt, clearRateLimit } from "@/lib/utils/rate-limit";
import { logger } from "@/lib/logger";
import { allowedModulesForTenant, type ModuleKey } from "@/lib/modules";

/**
 * Resolve os módulos liberados por tenant (gating por plano), com cache em
 * processo de curta duração. Permite que a mudança de plano no admin reflita em
 * sessões existentes em ~MODULES_CACHE_TTL_MS, sem exigir relogin e sem bater no
 * banco a cada request. (Decisão do dono: "JWT + invalidar ao mudar plano".)
 */
const MODULES_CACHE_TTL_MS = 60_000;
const modulesCache = new Map<string, { modules: ModuleKey[]; expiresAt: number }>();

async function resolveModulesByTenant(
  tenants: Array<{ id: string; slug: string; plan: string | null }>,
  opts?: { withPlan?: boolean },
): Promise<Map<string, ModuleKey[]>> {
  const result = new Map<string, ModuleKey[]>();
  const now = Date.now();

  // Quais tenants precisam de consulta (cache expirado/ausente)?
  const stale = tenants.filter((t) => {
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
      const dbTenants =
        opts?.withPlan
          ? await tx.tenant.findMany({
              where: { id: { in: stale.map((t) => t.id) } },
              select: { id: true, slug: true, plan: true },
            })
          : stale.map((t) => ({ id: t.id, slug: t.slug, plan: t.plan }));

      const planIds = Array.from(
        new Set(dbTenants.map((t) => t.plan).filter((p): p is string => Boolean(p))),
      );
      const plans = planIds.length
        ? await tx.plan.findMany({
            where: { id: { in: planIds } },
            select: { id: true, features: true },
          })
        : [];
      const featuresByPlanId = new Map(plans.map((p) => [p.id, p.features]));
      return { dbTenants, featuresByPlanId };
    });

    for (const t of data.dbTenants) {
      const modules = allowedModulesForTenant({
        tenantSlug: t.slug,
        hasPlan: Boolean(t.plan),
        planFeatures: t.plan ? data.featuresByPlanId.get(t.plan) : null,
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
        cpf: { label: "CPF", type: "text" },
        password: { label: "Senha", type: "password" },
      },
      async authorize(credentials) {
        const parsed = cpfSchema.safeParse(credentials?.cpf);
        if (!parsed.success) return null;

        const cpf = parsed.data;
        const password = credentials?.password;
        if (typeof password !== "string" || !password) return null;

        // Rate limit por CPF (5 tentativas / 15min → lockout 15min)
        const rateLimitKey = `login:${cpf}`;
        const limitCheck = checkRateLimit(rateLimitKey);
        if (!limitCheck.allowed) {
          const minutes = Math.ceil(limitCheck.retryAfterMs / 60000);
          logger.warn("Login bloqueado por rate limit", { cpf: cpf.slice(0, 3) + "***", retryAfterMin: minutes });
          throw new Error(`Muitas tentativas de login. Tente novamente em ${minutes} minuto${minutes > 1 ? "s" : ""}.`);
        }

        const user = await withAdmin(async (tx) => {
          return tx.user.findUnique({ where: { cpf } });
        });

        if (!user) {
          recordFailedAttempt(rateLimitKey);
          return null;
        }
        if (!compareSync(password, user.passwordHash)) {
          const updated = recordFailedAttempt(rateLimitKey);
          logger.warn("Login falhou: senha incorreta", { cpf: cpf.slice(0, 3) + "***", remaining: updated.remainingAttempts });
          return null;
        }

        // Sucesso — limpa contador
        clearRateLimit(rateLimitKey);

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          cpf: user.cpf,
          isSuperAdmin: user.isSuperAdmin,
        };
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user }) {
      // First call after login — populate token with user data + tenants
      if (user) {
        token.id = user.id!;
        token.cpf = (user as { cpf: string }).cpf;
        token.isSuperAdmin = (user as { isSuperAdmin: boolean }).isSuperAdmin;

        const userTenants = await withAdmin(async (tx) => {
          return tx.userTenant.findMany({
            where: { userId: user.id! },
            include: {
              tenant: { select: { id: true, slug: true, name: true, plan: true } },
            },
          });
        });

        const modulesByTenantId = await resolveModulesByTenant(
          userTenants.map((ut) => ({ slug: ut.tenant.slug, plan: ut.tenant.plan, id: ut.tenant.id })),
        );

        token.availableTenants = userTenants.map((ut) => ({
          id: ut.tenant.id,
          slug: ut.tenant.slug,
          name: ut.tenant.name,
          role: ut.role,
          modules: modulesByTenantId.get(ut.tenant.id) ?? [],
        }));

        token.activeTenantId = userTenants.length === 1 ? userTenants[0]!.tenant.id : null;
        token.impersonatedTenantId = null;
      } else if (Array.isArray(token.availableTenants) && token.availableTenants.length > 0) {
        // Requisições subsequentes (sem `user`): re-resolve os módulos a partir
        // do plano atual, com cache de curta duração (TTL). Garante que mudar o
        // plano de um tenant no admin reflita SEM exigir relogin — em ~60s, sem
        // bater no banco a cada request. (Decisão: "JWT + invalidar ao mudar plano".)
        const current = token.availableTenants as Array<{
          id: string;
          slug: string;
          name: string;
          role: string;
          modules: string[];
        }>;
        const fresh = await resolveModulesByTenant(
          current.map((t) => ({ slug: t.slug, plan: null, id: t.id })),
          { withPlan: true },
        );
        token.availableTenants = current.map((t) => ({
          ...t,
          modules: fresh.get(t.id) ?? t.modules,
        }));
      }

      return token;
    },

    async session({ session, token }) {
      session.user.id = token.id as string;
      session.user.cpf = token.cpf as string;
      session.user.isSuperAdmin = token.isSuperAdmin as boolean;
      session.activeTenantId = (token.activeTenantId as string) ?? null;
      session.impersonatedTenantId = (token.impersonatedTenantId as string) ?? null;
      session.availableTenants =
        (token.availableTenants as Array<{
          id: string;
          slug: string;
          name: string;
          role: string;
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
        return `${target.pathname}${target.search}` || "/";
      } catch {
        return "/";
      }
    },
  },
});
