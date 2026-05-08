/**
 * NextAuth v5 (beta.31) configuration — Credentials provider with CPF + password.
 *
 * JWT strategy. No database sessions.
 * Session carries: user info, activeTenantId, availableTenants[].
 * Tenant selection happens post-login via switchTenant server action.
 *
 * @see docs/decisions/0002-auth-strategy.md
 */
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compareSync } from "bcryptjs";
import { cpfSchema } from "@/lib/validators/cpf";
import { prisma, withAdmin } from "@/server/db";

export const { handlers, signIn, signOut, auth } = NextAuth({
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

        // Fetch user without RLS (auth precedes tenant scope)
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

  session: { strategy: "jwt" },

  pages: {
    signIn: "/login",
    error: "/login",
  },

  callbacks: {
    async jwt({ token, user }) {
      // First call after login — populate token with user data + tenant info
      if (user) {
        token.id = user.id!;
        token.cpf = user.cpf;
        token.isSuperAdmin = user.isSuperAdmin;

        // Load available tenants
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

        // Auto-select tenant if user has exactly 1
        if (userTenants.length === 1) {
          token.activeTenantId = userTenants[0]!.tenant.id;
        } else {
          token.activeTenantId = null;
        }

        token.impersonatedTenantId = null;
      }

      return token;
    },

    async session({ session, token }) {
      session.user.id = token.id;
      session.user.cpf = token.cpf;
      session.user.isSuperAdmin = token.isSuperAdmin;
      session.activeTenantId = token.activeTenantId;
      session.impersonatedTenantId = token.impersonatedTenantId;
      session.availableTenants = token.availableTenants;
      return session;
    },
  },
});
