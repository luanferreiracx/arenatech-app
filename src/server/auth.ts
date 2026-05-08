/**
 * NextAuth v5 — Placeholder
 * Implementação completa na Fase 3 (Auth com CPF + multi-tenant).
 *
 * @see https://authjs.dev/getting-started/installation
 */
import NextAuth from "next-auth";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/auth/login",
  },
});
