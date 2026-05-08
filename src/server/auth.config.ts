/**
 * Auth configuration shared between Edge (middleware) and Node.js (full auth).
 * This file MUST NOT import Node.js-only modules (bcrypt, prisma, pg adapter).
 */
import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  session: { strategy: "jwt" },

  pages: {
    signIn: "/login",
    error: "/login",
  },

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id!;
        token.cpf = (user as { cpf: string }).cpf;
        token.isSuperAdmin = (user as { isSuperAdmin: boolean }).isSuperAdmin;
        // availableTenants is populated by the full auth.ts jwt callback
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

    authorized({ auth, request }) {
      // Used by NextAuth's middleware wrapper — just check if logged in
      // Actual route protection logic is in our custom middleware
      return true;
    },
  },

  providers: [], // Providers added in auth.ts (Node.js only)
} satisfies NextAuthConfig;
