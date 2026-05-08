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

export const { handlers, signIn, signOut, auth } = NextAuth({
  session: { strategy: "jwt" },

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

        const user = await withAdmin(async (tx) => {
          return tx.user.findUnique({ where: { cpf } });
        });

        if (!user) return null;
        if (!compareSync(password, user.passwordHash)) return null;

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
