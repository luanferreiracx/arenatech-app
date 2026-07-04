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
  "wallet", // DePix Wallet/LWK: carteira, saldos e saques (/depix-wallet)
  "depix-ops", // Operações DePix wallet-backed: vendas avulsas (/quick-sales)
  "service-orders", // Assistência: OS, serviços, operação, comunicação
  "customers", // Clientes e interesses
  "tools", // Simulador, avaliação, consultas, checklist
  "pdv", // Vendas / PDV
  "stock", // Estoque e catálogo de aparelhos
  "cashier", // Caixa e conferências
  "financial", // Financeiro (exceto DePix wallet/saques)
  "fiscal", // Fiscal / NF-e / relatórios fiscais
  "commissions", // Comissões
  "settings", // Configurações do tenant (gerais, formas de pagamento, etc.)
  "partner-api", // API externa de parceiros (ADR 0057). Override por-tenant (apiAccessEnabled).
] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];

const MODULE_KEY_SET = new Set<string>(MODULE_KEYS);

/** Rótulos legíveis para a UI de configuração de plano. */
export const MODULE_LABELS: Record<ModuleKey, string> = {
  wallet: "Carteira DePix Wallet",
  "depix-ops": "Vendas Avulsas Wallet",
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
  "partner-api": "API de Parceiros",
};

export function isModuleKey(value: string): value is ModuleKey {
  return MODULE_KEY_SET.has(value);
}

/**
 * Módulos controlados por OVERRIDE por-tenant (não pelo plano). Ficam fora do
 * editor de plano — quem libera é o superadmin no detalhe do tenant.
 */
export const PER_TENANT_OVERRIDE_MODULES: ModuleKey[] = ["partner-api"];

/** Módulos selecionáveis no editor de PLANO (exclui os de override por-tenant). */
export const PLAN_SELECTABLE_MODULES: ModuleKey[] = MODULE_KEYS.filter(
  (m) => !PER_TENANT_OVERRIDE_MODULES.includes(m),
);

/** Slug do tenant com acesso total (bypass do gating). */
export const TOTAL_ACCESS_TENANT_SLUG = "arena-tech";

/**
 * Módulos liberados por padrão para tenants novos enquanto validamos os demais.
 * - `wallet`: carteira DePix (saldo, depósito, saque).
 * - `depix-ops`: link público de pagamento (/quick-sales -> /pay). Liberado a
 *   todos pois é só a ponte para a cobrança pública — as operações de carteira
 *   já vivem em `wallet`.
 */
export const DEFAULT_RELEASED_MODULES: ModuleKey[] = ["wallet", "depix-ops"];

/**
 * Módulos de um tenant NO-KYC (sem documento) ENQUANTO ele não tem plano ativo:
 * carteira DePix + link público de pagamento. NO-KYC é o ESTADO INICIAL de todo
 * tenant (cadastro por email/WhatsApp), não um teto permanente — ao ativar o
 * plano, o superadmin libera os módulos do plano mesmo sem CNPJ (revisão da
 * política do ADR 0050). Constante própria (não reaproveita DEFAULT_RELEASED_MODULES)
 * para que mudar o default de tenants novos no futuro não altere o piso NO-KYC.
 */
export const NO_KYC_MODULES: ModuleKey[] = ["wallet", "depix-ops"];

/**
 * Mapa de prefixo de rota → módulo. A ordem importa: prefixos mais específicos
 * vêm antes dos genéricos (ex.: `/depix-wallet` antes de qualquer rota financeira).
 * `resolveModuleForPath` casa pelo primeiro prefixo que bate.
 */
const ROUTE_MODULE_PREFIXES: ReadonlyArray<readonly [string, ModuleKey]> = [
  // DePix Wallet — `/depix/*` existe apenas como redirect legado para a Wallet.
  ["/depix-wallet", "wallet"],
  ["/depix", "wallet"],
  ["/quick-sales", "depix-ops"],

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

  // partner-api ANTES de /settings (mais específico vence). Módulo próprio com
  // override por-tenant (apiAccessEnabled) — ver allowedModulesForTenant.
  ["/settings/partner-api", "partner-api"],

  // settings (configurações do tenant). Gateado: por enquanto NÃO liberado.
  ["/settings", "settings"],
];

/**
 * Resolve o módulo de uma rota. Retorna `null` para rotas sem gating de módulo
 * (painel, troca de tenant, admin, públicas) — essas passam livres.
 * Settings agora É gateado (módulo `settings`) — fica fora do plano por enquanto.
 */
export function resolveModuleForPath(pathname: string): ModuleKey | null {
  // /settings/security e primitivo de seguranca (2FA + troca de senha) que TODO
  // usuario precisa — em especial tenants wallet/NO-KYC, que sao OBRIGADOS a
  // habilitar 2FA pra sacar/transferir. Nunca gateado por modulo/plano, senao o
  // tenant fica num beco: o saque exige 2FA mas a pagina de habilitar e bloqueada.
  if (pathname === "/settings/security" || pathname.startsWith("/settings/security/")) {
    return null;
  }
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
      const modules = Array.from(new Set(parsed));
      return modules.length > 0 ? modules : [...DEFAULT_RELEASED_MODULES];
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
  /** Tenant NO-KYC (sem documento — ADR 0050): teto rígido em `wallet`. */
  isNoKyc?: boolean;
  /** Override por-tenant da API externa (ADR 0057), ligado pelo superadmin. */
  apiAccessEnabled?: boolean;
}): ModuleKey[] {
  const base = resolveBaseModules(args);
  return applyPerTenantOverrides(base, args);
}

function resolveBaseModules(args: {
  tenantSlug: string | null | undefined;
  planFeatures: unknown;
  hasPlan: boolean;
  isNoKyc?: boolean;
}): ModuleKey[] {
  if (args.tenantSlug === TOTAL_ACCESS_TENANT_SLUG) {
    return [...MODULE_KEYS];
  }
  // Com plano ATIVO, o plano manda — inclusive para NO-KYC. Ativar = liberar os
  // módulos do plano; NO-KYC deixa de ser teto e vira apenas o estado inicial
  // "sem plano" (revisão da política do ADR 0050). O superadmin só atribui plano
  // a tenant NO-KYC de forma explícita.
  if (args.hasPlan) {
    return modulesFromPlanFeatures(args.planFeatures);
  }
  // Sem plano: NO-KYC fica no piso (wallet + link de cobrança); demais tenants
  // caem no default liberado.
  if (args.isNoKyc) {
    return [...NO_KYC_MODULES];
  }
  return [...DEFAULT_RELEASED_MODULES];
}

/**
 * Overrides POR-TENANT que somam ao que o plano libera (controle do superadmin,
 * fora da matriz de plano). Hoje: `partner-api` via `apiAccessEnabled`. Ponto único
 * pra futuros toggles por-tenant — sem espalhar exceções pelo código.
 */
function applyPerTenantOverrides(
  base: ModuleKey[],
  args: { apiAccessEnabled?: boolean },
): ModuleKey[] {
  const set = new Set<ModuleKey>(base);
  if (args.apiAccessEnabled) set.add("partner-api");
  return [...set];
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
