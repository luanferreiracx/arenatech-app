import {
  ALWAYS_ON_MODULES,
  MODULE_LABELS,
  TOTAL_ACCESS_TENANT_SLUG,
  isModuleKey,
  withModuleDependencies,
  type ModuleKey,
} from "@/lib/modules";

/**
 * O tenant tem este módulo no plano?
 *
 * Fonte ÚNICA da decisão de gating por plano, compartilhada pela borda tRPC
 * (`tenantProcedure`) e pelas rotas REST. Antes a regra existia só dentro do
 * `trpc.ts`, e as ~26 rotas REST autenticadas por sessão ficavam **sem gate
 * nenhum**: o proxy isenta `/api/*` de propósito (um redirect 307 → HTML quebra
 * o cliente JSON — incidente documentado) e o `tenantProcedure` não passa por
 * elas.
 *
 * Isso importa porque `tenantProcedure` + RLS garantem **isolamento** (o dado é
 * do tenant certo), não **gating de plano**. Um tenant wallet-only não
 * conseguia chamar `stock.*` pelo tRPC, mas baixava o PDF de posição de estoque,
 * o CSV do financeiro e o recibo do PDV pela rota REST equivalente.
 *
 * Escrever a regra em dois lugares seria repetir exatamente o padrão que este
 * programa de finalização encontrou em três módulos: duas implementações, o
 * endurecimento numa e os usuários na outra. Por isso: uma função, dois
 * chamadores.
 */
export interface ModuleGateSession {
  user: { id: string };
  availableTenants?: Array<{ id: string; slug?: string; modules?: string[] }>;
}

export function isModuleAllowedForTenant(
  session: ModuleGateSession,
  tenantId: string,
  required: ModuleKey,
): boolean {
  const tenant = session.availableTenants?.find((t) => t.id === tenantId);
  // Dependências: quem tem `pdv` tem `cashier`/`financial` implicitamente —
  // mesma expansão que o gating de rota de página aplica.
  const granted = new Set(withModuleDependencies((tenant?.modules ?? []).filter(isModuleKey)));
  // `wallet`/`depix-ops` NÃO entram aqui como sempre-ligados: desde o gate
  // `Tenant.depixEnabled` eles chegam pela lista de módulos da sessão, montada
  // por `allowedModulesForTenant`. Tratá-los como incondicionais aqui furaria o
  // gate justamente na borda que protege as rotas REST.
  return (
    tenant?.slug === TOTAL_ACCESS_TENANT_SLUG ||
    ALWAYS_ON_MODULES.includes(required) ||
    granted.has(required)
  );
}

/** Mensagem única de recusa, para tRPC e REST dizerem a mesma coisa. */
export function moduleDeniedMessage(required: ModuleKey): string {
  return `Modulo "${MODULE_LABELS[required] ?? required}" nao esta incluso no plano deste tenant.`;
}
