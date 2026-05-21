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

export const { handlers, signIn, signOut, auth } = NextAuth({
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
            include: { tenant: { select: { id: true, slug: true, name: true } } },
          });
        });

        token.availableTenants = userTenants.map((ut) => ({
          id: ut.tenant.id,
          slug: ut.tenant.slug,
          name: ut.tenant.name,
          role: ut.role,
        }));

        token.activeTenantId = userTenants.length === 1 ? userTenants[0]!.tenant.id : null;
        token.impersonatedTenantId = null;
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
        (token.availableTenants as Array<{ id: string; slug: string; name: string; role: string }>) ?? [];
      return session;
    },

    authorized() {
      // Route protection handled by proxy.ts — always allow here
      return true;
    },
  },
});
