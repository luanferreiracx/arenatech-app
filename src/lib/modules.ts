/**
 * Catálogo de módulos para gating por plano.
 *
 * Cada módulo agrupa um conjunto de rotas (prefixos) e itens de menu. O acesso
 * é liberado por plano via `Plan.features.modules: string[]`.
 *
 * Regras (confirmadas com o dono):
 * - Gating POR PLANO: a lista de módulos liberados vem de `Plan.features.modules`.
 * - O tenant `arena-tech` tem acesso TOTAL (bypass — não é afetado pela matriz).
 * - Módulo não liberado: some do menu E a rota é bloqueada (redirect /painel).
 * - Por enquanto só `wallet` é liberado para tenants novos; os demais serão
 *   liberados conforme validamos cada módulo.
 *
 * Módulos em ALWAYS_ON estão sempre disponíveis (infra mínima de operação:
 * painel, troca de tenant, sair). Settings é always-on porque um tenant precisa
 * configurar a própria conta independentemente do plano.
 */

export const MODULE_KEYS = [
  "wallet", // DePix: carteira, vendas avulsas, saques
  "service-orders", // Assistência: OS, serviços, operação, comunicação
  "customers", // Clientes e interesses
  "tools", // Simulador, avaliação, consultas, checklist
  "pdv", // Vendas / PDV
  "stock", // Estoque e catálogo de aparelhos
  "cashier", // Caixa e conferências
  "financial", // Financeiro (exceto DePix wallet/saques, que são `wallet`)
  "fiscal", // Fiscal / NF-e / relatórios fiscais
  "commissions", // Comissões
  "settings", // Configurações do tenant (gerais, formas de pagamento, etc.)
] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];

const MODULE_KEY_SET = new Set<string>(MODULE_KEYS);

/** Rótulos legíveis para a UI de configuração de plano. */
export const MODULE_LABELS: Record<ModuleKey, string> = {
  wallet: "Carteira DePix",
  "service-orders": "Assistência (Ordens de Serviço)",
  customers: "Clientes",
  tools: "Ferramentas (Simulador, Avaliação, Consultas)",
  pdv: "Vendas / PDV",
  stock: "Estoque",
  cashier: "Caixa",
  financial: "Financeiro",
  fiscal: "Fiscal / NF-e",
  commissions: "Comissões",
  settings: "Configurações",
};

export function isModuleKey(value: string): value is ModuleKey {
  return MODULE_KEY_SET.has(value);
}

/** Slug do tenant com acesso total (bypass do gating). */
export const TOTAL_ACCESS_TENANT_SLUG = "arena-tech";

/**
 * Módulos liberados por padrão para tenants novos enquanto validamos os demais.
 * Hoje: apenas a carteira DePix.
 */
export const DEFAULT_RELEASED_MODULES: ModuleKey[] = ["wallet"];

/**
 * Mapa de prefixo de rota → módulo. A ordem importa: prefixos mais específicos
 * vêm antes dos genéricos (ex.: `/depix/withdrawals` antes de qualquer `/depix`).
 * `resolveModuleForPath` casa pelo primeiro prefixo que bate.
 */
const ROUTE_MODULE_PREFIXES: ReadonlyArray<readonly [string, ModuleKey]> = [
  // wallet (DePix) — checado antes de `financial` para "roubar" as rotas DePix
  ["/depix-wallet", "wallet"],
  ["/depix/withdrawals", "wallet"],
  ["/depix", "wallet"],
  ["/quick-sales", "wallet"],

  // service-orders / assistência
  ["/service-orders", "service-orders"],
  ["/services", "service-orders"],
  ["/operation", "service-orders"],
  ["/communication", "service-orders"],

  // customers
  ["/customers", "customers"],
  ["/interests", "customers"],

  // tools
  ["/simulator", "tools"],
  ["/valuations", "tools"],
  ["/imei", "tools"],
  ["/checklist", "tools"],

  // pdv
  ["/pdv", "pdv"],

  // stock
  ["/stock", "stock"],
  ["/aparelhos-catalogo", "stock"],

  // cashier
  ["/cashier", "cashier"],

  // financial (rotas DePix já foram capturadas acima)
  ["/financial", "financial"],

  // fiscal
  ["/fiscal", "fiscal"],
  ["/reports", "fiscal"],

  // commissions
  ["/commissions", "commissions"],

  // settings (configurações do tenant). Gateado: por enquanto NÃO liberado.
  ["/settings", "settings"],
];

/**
 * Resolve o módulo de uma rota. Retorna `null` para rotas sem gating de módulo
 * (painel, troca de tenant, admin, públicas) — essas passam livres.
 * Settings agora É gateado (módulo `settings`) — fica fora do plano por enquanto.
 */
export function resolveModuleForPath(pathname: string): ModuleKey | null {
  for (const [prefix, key] of ROUTE_MODULE_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(prefix + "/")) {
      return key;
    }
  }
  return null;
}

/**
 * Extrai a lista de módulos liberados a partir do `features` do plano.
 * Aceita `features.modules: string[]`. Valores desconhecidos são ignorados.
 * Plano sem `modules` definido → cai no padrão (apenas wallet).
 */
export function modulesFromPlanFeatures(features: unknown): ModuleKey[] {
  if (features && typeof features === "object" && "modules" in features) {
    const raw = (features as { modules: unknown }).modules;
    if (Array.isArray(raw)) {
      const parsed = raw.filter(
        (m): m is ModuleKey => typeof m === "string" && isModuleKey(m),
      );
      return Array.from(new Set(parsed));
    }
  }
  return [...DEFAULT_RELEASED_MODULES];
}

/**
 * Módulos efetivamente liberados para um tenant.
 * - `arena-tech` → TODOS (acesso total).
 * - demais → o que o plano libera (ou o padrão, se sem plano/sem modules).
 */
export function allowedModulesForTenant(args: {
  tenantSlug: string | null | undefined;
  planFeatures: unknown;
  hasPlan: boolean;
}): ModuleKey[] {
  if (args.tenantSlug === TOTAL_ACCESS_TENANT_SLUG) {
    return [...MODULE_KEYS];
  }
  if (!args.hasPlan) {
    return [...DEFAULT_RELEASED_MODULES];
  }
  return modulesFromPlanFeatures(args.planFeatures);
}

/** True se o módulo da rota está liberado para a lista de módulos do tenant. */
export function isPathAllowed(
  pathname: string,
  allowedModules: readonly string[],
): boolean {
  const mod = resolveModuleForPath(pathname);
  if (mod === null) return true; // rota sem gating de módulo
  return allowedModules.includes(mod);
}
