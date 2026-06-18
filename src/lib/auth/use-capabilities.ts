"use client";

import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/react";
import { can, type Capability } from "@/lib/auth/capabilities";

/**
 * Hook client: o usuário pode executar `capability` no tenant ativo?
 *
 * Usa `auth.me` (server-backed), igual ao `use-tenant-admin` — o app não tem
 * <SessionProvider>. Enquanto a sessão carrega, retorna `false` (fail-safe:
 * melhor esconder a mais do que vazar um botão que dará erro).
 */
export function useCan(capability: Capability): boolean {
  const trpc = useTRPC();
  const { data: me } = useQuery(trpc.auth.me.queryOptions());
  if (!me || !me.activeTenantId) return false;
  return can(me, me.activeTenantId, capability);
}
