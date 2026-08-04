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

/**
 * Hook client: o usuário está em MODO BANCADA no tenant ativo?
 *
 * Modo bancada enxuga a tela de OS para quem só faz reparo: esconde o bloco de
 * dinheiro e documentos (Receber Pagamento, Recibo, Termos, Estornar, Cancelar)
 * e deixa em evidência diagnóstico e conclusão.
 *
 * É configurável por usuário (decisão do dono, 2026-08-04) e NÃO é derivado de
 * `isTechnician`: em loja pequena o técnico às vezes também atende o balcão, e
 * aí esconder botão atrapalha.
 *
 * NÃO é permissão — o servidor continua barrando quem não pode. É redução de
 * carga cognitiva. Por isso o fail-safe aqui é o INVERSO do `useIsTenantAdmin`:
 * enquanto carrega, retorna `false` (mostra tudo). Esconder à toa seria pior
 * que mostrar demais por um instante.
 */
export function useIsBenchMode(): boolean {
  const trpc = useTRPC();
  const { data: me } = useQuery(trpc.auth.me.queryOptions());
  if (!me?.activeTenantId) return false;
  const active = me.availableTenants.find((t) => t.id === me.activeTenantId);
  return !!active?.benchModeOnly;
}
