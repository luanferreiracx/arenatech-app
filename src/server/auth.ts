/**
 * NextAuth v5 (beta.31) — Full configuration (Node.js only).
 * Imports Edge-safe base config and adds Credentials provider with bcrypt + Prisma.
 *
 * @see docs/decisions/0002-auth-strategy.md
 */
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compareSync } from "bcryptjs";
import { cpfSchema } from "@/lib/validators/cpf";
import { withAdmin } from "@/server/db";
import { authConfig } from "@/server/auth.config";

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,

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
    ...authConfig.callbacks,

    async jwt({ token, user }) {
      // Run base config jwt callback first
      token = await authConfig.callbacks.jwt({ token, user } as Parameters<NonNullable<typeof authConfig.callbacks.jwt>>[0]);

      // On first login, load available tenants from DB
      if (user) {
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
        token.activeTenantId = userTenants.length === 1 ? userTenants[0]!.tenant.id : null;
        token.impersonatedTenantId = null;
      }

      return token;
    },
  },
});
