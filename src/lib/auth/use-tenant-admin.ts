"use client";

import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/react";
import { isTenantAdmin } from "@/lib/auth/roles";

/**
 * Hook client: o usuario e admin do tenant ativo?
 *
 * Usa `auth.me` (server-backed) em vez de useSession() do next-auth/react — o
 * app nao tem <SessionProvider>, entao useSession lanca. auth.me devolve user +
 * availableTenants + activeTenantId de forma estavel.
 *
 * Enquanto a sessao carrega, retorna `false` (esconde acoes admin por padrao —
 * fail-safe: melhor esconder a mais do que vazar um botao que dara erro).
 */
export function useIsTenantAdmin(): boolean {
  const trpc = useTRPC();
  const { data: me } = useQuery(trpc.auth.me.queryOptions());
  return !!(me && me.activeTenantId && isTenantAdmin(me, me.activeTenantId));
}

/**
 * Hook client: o usuario e super admin (Arena Tech)?
 *
 * Mesmo padrao/fail-safe do useIsTenantAdmin. Usado por telas cujas mutations
 * sao superAdminTenantProcedure (ex.: taxas do simulador) — pra nao mostrar um
 * form editavel que so daria erro pro admin de tenant comum.
 */
export function useIsSuperAdmin(): boolean {
  const trpc = useTRPC();
  const { data: me } = useQuery(trpc.auth.me.queryOptions());
  return me?.user?.isSuperAdmin === true;
}
