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
 * - Tenant sem plano (NO-KYC = estado inicial): piso `wallet` + `depix-ops`.
 *   A ativação atribui um plano ativo, que define os módulos (mesmo sem CNPJ).
 *
 * Duas dimensões de gating de ROTA (ver `isRouteAllowedForTenant`, usada no proxy):
 * 1. Módulo/plano — a maioria das rotas casa um prefixo em ROUTE_MODULE_PREFIXES.
 * 2. Slug — ferramentas internas restritas a um tenant (SLUG_RESTRICTED_ROUTES).
 *
 * Rotas sem módulo nem restrição de slug passam livres (painel, troca de tenant).
 * `settings` é SEMPRE-ON (ALWAYS_ON_MODULES): todo tenant configura a própria
 * loja, independente do plano. `/settings/security` também (2FA é pré-requisito
 * de saque DePix). Ambos ficam fora da matriz de plano.
 */

export const MODULE_KEYS = [
  "wallet", // DePix Wallet/LWK: carteira, saldos e saques (/depix-wallet)
  "depix-ops", // Operações DePix wallet-backed: vendas avulsas (/quick-sales)
  "service-orders", // Assistência: OS, serviços, operação, comunicação
  "customers", // Clientes e interesses
  "tools", // Simulador, avaliação, consultas
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
 * Dependências entre módulos. Selecionar um módulo exige (e auto-inclui) seus
 * pré-requisitos — não dá pra montar um plano quebrado. Mistura de acoplamento
 * TÉCNICO (o código quebra sem) e regra de PRODUTO (decisão do dono):
 * - `pdv` → `cashier` (venda em dinheiro exige caixa aberto — sale.ts) +
 *   `financial` (toda venda cria financialTransaction) + `stock` (todo item de
 *   venda exige `productId`, e Product é do módulo stock — sem estoque não há o
 *   que vender) + `customers` (produto: não se vende um aparelho sem cadastrar
 *   o cliente).
 * - `service-orders` → `pdv` (OS é paga via PDV — createFromOS, herda pdv→...) +
 *   `customers` (produto: uma OS é sempre de um cliente).
 * - `depix-ops` → `wallet` (quick-sale cria depósito na carteira).
 * - `fiscal` → `pdv` (NF-e é emitida a partir de uma venda).
 * - `commissions` → `pdv` (comissão deriva de venda/OS).
 */
export const MODULE_DEPENDENCIES: Partial<Record<ModuleKey, ModuleKey[]>> = {
  pdv: ["cashier", "financial", "stock", "customers"],
  "service-orders": ["pdv", "customers"],
  "depix-ops": ["wallet"],
  fiscal: ["pdv"],
  commissions: ["pdv"],
};

/**
 * Expande uma lista de módulos incluindo todos os pré-requisitos (transitivo).
 * Ex.: ["service-orders"] → ["service-orders", "pdv", "cashier", "financial"].
 * Idempotente e resistente a ciclos (guarda por `resolved`).
 */
export function withModuleDependencies(modules: readonly ModuleKey[]): ModuleKey[] {
  const resolved = new Set<ModuleKey>();
  const visit = (mod: ModuleKey) => {
    if (resolved.has(mod)) return;
    resolved.add(mod);
    for (const dep of MODULE_DEPENDENCIES[mod] ?? []) visit(dep);
  };
  for (const mod of modules) visit(mod);
  return [...resolved];
}

/**
 * Módulos que são PRÉ-REQUISITO de algum OUTRO módulo presente na seleção. A UI
 * do editor de plano usa isto para travar (não desmarcar) um módulo enquanto
 * quem depende dele estiver marcado — ex.: com `pdv` na seleção, `cashier` e
 * `financial` ficam exigidos (travados). Semântica robusta a "escolhido direto
 * vs auto-incluído": o que importa é se ALGUÉM na seleção depende do módulo.
 */
export function modulesRequiredBySelection(selection: readonly ModuleKey[]): Set<ModuleKey> {
  const required = new Set<ModuleKey>();
  for (const mod of selection) {
    for (const dep of withModuleDependencies([mod])) {
      if (dep !== mod) required.add(dep);
    }
  }
  return required;
}

/**
 * Módulos controlados por OVERRIDE por-tenant (não pelo plano). Ficam fora do
 * editor de plano — quem libera é o superadmin no detalhe do tenant.
 */
export const PER_TENANT_OVERRIDE_MODULES: ModuleKey[] = ["partner-api"];

/**
 * Módulos SEMPRE ligados, independente do plano (decisão do dono). Ficam fora do
 * editor de plano e são concedidos a qualquer tenant, inclusive o suspenso por
 * inadimplência (ADR 0061 — o bloqueio suave preserva exatamente este piso).
 *
 * - `settings`: todo tenant configura a própria loja (formas de pagamento,
 *   equipe, integrações). Como `/settings/security` já era.
 * - `wallet` + `depix-ops`: a carteira guarda o DINHEIRO do cliente. Nenhuma
 *   decisão comercial nossa pode separá-lo dele, nem quando ele deve. Reter
 *   saldo alheio como alavanca de cobrança seria abuso, além de risco
 *   regulatório (ADR 0061).
 *
 * `partner-api` também não depende de plano, mas NÃO entra aqui: continua sob o
 * override por tenant `apiAccessEnabled` (ADR 0057), que é controle de segurança
 * e não de pacote.
 */
export const ALWAYS_ON_MODULES: ModuleKey[] = ["settings", "wallet", "depix-ops"];

/**
 * Módulos selecionáveis no editor de PLANO: exclui os de override por-tenant e os
 * sempre-ligados (esses não são escolha de plano).
 */
export const PLAN_SELECTABLE_MODULES: ModuleKey[] = MODULE_KEYS.filter(
  (m) => !PER_TENANT_OVERRIDE_MODULES.includes(m) && !ALWAYS_ON_MODULES.includes(m),
);

/** Slug do tenant com acesso total (bypass do gating). */
export const TOTAL_ACCESS_TENANT_SLUG = "arena-tech";

/**
 * Rotas restritas a slugs específicos, INDEPENDENTE de módulo/plano. Ferramentas
 * internas que não pertencem a nenhum módulo comercializável (ex.: o buscador de
 * iPhones em grupos, só do arena-tech). Sem isto, a rota não casa nenhum prefixo
 * de módulo → `resolveModuleForPath` retorna null → passaria livre por URL para
 * qualquer tenant, ainda que o menu a esconda (o menu usa `requiresTenantSlug`,
 * que não bloqueia a rota). `isRouteAllowedForTenant` fecha esse buraco.
 */
const SLUG_RESTRICTED_ROUTES: ReadonlyArray<readonly [string, readonly string[]]> = [
  ["/iphone-hunter", [TOTAL_ACCESS_TENANT_SLUG]],
];

/** Slugs autorizados para uma rota restrita por slug, ou null se não for restrita. */
function slugAllowlistForPath(pathname: string): readonly string[] | null {
  for (const [prefix, slugs] of SLUG_RESTRICTED_ROUTES) {
    if (pathname === prefix || pathname.startsWith(prefix + "/")) return slugs;
  }
  return null;
}

/**
 * Módulos PAGOS de um tenant sem plano: nenhum.
 *
 * Antes existiam duas constantes aqui (`DEFAULT_RELEASED_MODULES` para tenant
 * novo, `NO_KYC_MODULES` para tenant sem documento), ambas valendo
 * `["wallet", "depix-ops"]`. O ADR 0061 moveu esses dois para
 * `ALWAYS_ON_MODULES`, o que zerou as duas listas e apagou a distinção entre
 * elas: sem plano, o tenant tem o piso sempre-ligado e mais nada. Uma constante
 * vazia é mais honesta que duas listas iguais e um `if` que finge escolher.
 */
export const NO_PLAN_MODULES: ModuleKey[] = [];

/**
 * Gating por ABA de Configurações. `settings` é sempre-ligado (todo tenant
 * configura a própria loja), mas as ABAS não são todas universais: um tenant que
 * só opera a carteira DePix não precisa de Fiscal, Formas de Pagamento, Cartões,
 * etc. Cada sub-rota declara o módulo FUNCIONAL de que depende — a aba (e a rota)
 * só aparece quando o tenant tem esse módulo.
 *
 * `null` = sempre-on (dados da loja, equipe, plano, auditoria, 2FA): visível a
 * qualquer tenant, inclusive wallet/NO-KYC.
 *
 * Decisões do dono:
 * - Geral, Equipe, Assinatura, Logs, Segurança → sempre-on.
 * - Fiscal → `fiscal`; Formas de Pagamento / Cartões / Regras de Venda → `pdv`;
 *   Integrações / Taxas do Simulador → `tools`; Assistência / Entregadores →
 *   `service-orders`; API de Parceiros → `partner-api`.
 *
 * Ordem: prefixos mais específicos primeiro (`resolveModuleForPath` casa o 1º).
 */
const SETTINGS_TAB_MODULE: ReadonlyArray<readonly [string, ModuleKey | null]> = [
  ["/settings/security", null],
  ["/settings/general", null],
  ["/settings/users", null],
  ["/settings/team", null],
  ["/settings/subscription", null],
  ["/settings/logs", null],
  ["/settings/partner-api", "partner-api"],
  ["/settings/depix", "wallet"],
  ["/settings/fiscal", "fiscal"],
  ["/settings/payment-methods", "pdv"],
  ["/settings/card-acquirers", "pdv"],
  ["/settings/receiving", "pdv"],
  ["/settings/installments", "tools"],
  ["/settings/integrations", "tools"],
  ["/settings/assistance", "service-orders"],
  ["/settings/bot", "service-orders"],
  ["/settings/delivery-persons", "service-orders"],
];

/**
 * Abas de Configurações que o OPERADOR pode abrir. Todo o resto de `/settings/*`
 * é do administrador do tenant.
 *
 * A lista é por exclusão de propósito: aba nova nasce restrita ao admin até
 * alguém declarar o contrário aqui. É o mesmo fail-closed de `isPathAllowed` —
 * o erro barato é o admin abrir um chamado dizendo "o operador não vê X"; o caro
 * é o operador achar que configura a taxa de cartão.
 *
 * Por que estas duas:
 * - `security` — 2FA e troca de senha são do próprio usuário, e 2FA é pré-requisito
 *   para saque DePix. Esta aba NUNCA é gateada (nem por módulo, nem por papel).
 * - `delivery-persons` — as procedures de entregador (`operation.*DeliveryPerson`)
 *   são `tenantProcedure` sem check de admin: cadastrar entregador é trabalho de
 *   operação, e o menu do operador já oferecia a tela.
 */
const SETTINGS_OPERATOR_TABS: readonly string[] = [
  "/settings/security",
  "/settings/delivery-persons",
];

/**
 * True quando a rota de Configurações exige papel de admin no tenant.
 *
 * Existe porque o gating de aba era só por MÓDULO: o operador via as 15 abas do
 * admin, com "Salvar"/"Nova Adquirente" habilitados, para configurações que o
 * backend recusa. Medido no navegador: operador em `/settings/receiving` preenche
 * o formulário, clica Salvar e só então recebe 403 "Apenas proprietários podem
 * alterar configurações de recebimento". O backend estava certo; a tela mentia.
 *
 * Consumida nos três lugares que decidem visibilidade — proxy (URL direta),
 * layout de settings (barra de abas) e menu lateral (`adminOnly`) — para não
 * repetir a regra em três formas diferentes.
 */
export function isAdminOnlySettingsPath(pathname: string): boolean {
  if (pathname !== "/settings" && !pathname.startsWith("/settings/")) return false;
  return !SETTINGS_OPERATOR_TABS.some(
    (tab) => pathname === tab || pathname.startsWith(`${tab}/`),
  );
}

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

  // customers
  ["/customers", "customers"],
  ["/interests", "customers"],
  // Fidelidade (reward): programa de relacionamento — pertence a clientes.
  ["/fidelidade", "customers"],
  // Relacionamento (WhatsApp/e-mail) é de CLIENTES, não de assistência — um
  // tenant de varejo puro (só PDV+clientes) também precisa do canal. service-orders
  // depende de customers, então tenants de OS seguem com acesso.
  ["/communication", "customers"],

  // tools
  ["/simulator", "tools"],
  ["/valuations", "tools"],
  ["/imei", "tools"],

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
  ["/my-commission", "commissions"],

  // settings/* é resolvido por SETTINGS_TAB_MODULE (por aba) antes deste mapa;
  // este prefixo é o fallback pra qualquer /settings/* não listado lá.
  ["/settings", "settings"],
];

/**
 * Resolve o módulo de uma rota. Retorna `null` para rotas sem gating de módulo
 * (painel, troca de tenant, admin, públicas, e abas de settings sempre-on) — essas
 * passam livres. Cada ABA de `/settings/*` é gateada pelo módulo funcional de que
 * depende (ver SETTINGS_TAB_MODULE), não pelo genérico `settings`.
 */
export function resolveModuleForPath(pathname: string): ModuleKey | null {
  // As abas de settings vêm ANTES do prefixo genérico `/settings` — cada uma casa
  // seu módulo funcional (fiscal/pdv/tools/service-orders) ou `null` (sempre-on,
  // ex.: security/general/users/subscription/logs). Um tenant só-wallet, p.ex.,
  // não vê Fiscal nem Formas de Pagamento, mas mantém Geral/Equipe/Segurança.
  for (const [prefix, mod] of SETTINGS_TAB_MODULE) {
    if (pathname === prefix || pathname.startsWith(prefix + "/")) {
      return mod;
    }
  }
  for (const [prefix, key] of ROUTE_MODULE_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(prefix + "/")) {
      return key;
    }
  }
  return null;
}

/**
 * Extrai os módulos PAGOS que o plano libera, a partir de `features.modules`.
 * Valores desconhecidos são ignorados. Plano sem `modules` (ou com lista vazia)
 * não libera nada além do piso sempre-ligado, que `allowedModulesForTenant`
 * soma depois.
 */
export function modulesFromPlanFeatures(features: unknown): ModuleKey[] {
  if (!features || typeof features !== "object" || !("modules" in features)) {
    return [...NO_PLAN_MODULES];
  }
  const raw = (features as { modules: unknown }).modules;
  if (!Array.isArray(raw)) return [...NO_PLAN_MODULES];

  const parsed = raw.filter((m): m is ModuleKey => typeof m === "string" && isModuleKey(m));
  return Array.from(new Set(parsed));
}

/**
 * Módulos efetivamente liberados para um tenant.
 * - `arena-tech` → TODOS (acesso total).
 * - `blocked` (inadimplente suspenso, ADR 0061) → só o piso sempre-ligado.
 * - demais → o piso mais o que o plano libera.
 */
export function allowedModulesForTenant(args: {
  tenantSlug: string | null | undefined;
  planFeatures: unknown;
  hasPlan: boolean;
  /**
   * Assinatura suspensa por falta de pagamento. Derruba os módulos pagos e
   * mantém o piso — carteira, link de cobrança e configurações seguem de pé
   * para o cliente conseguir pagar e mexer no próprio dinheiro (ADR 0061).
   */
  blocked?: boolean;
  /** Override por-tenant da API externa (ADR 0057), ligado pelo superadmin. */
  apiAccessEnabled?: boolean;
}): ModuleKey[] {
  const base = resolveBaseModules(args);
  const withOverrides = applyPerTenantOverrides(base, args);
  // Auto-inclui pré-requisitos (plano quebrado não vira acesso quebrado) e soma
  // o piso sempre-ligado. arena-tech já tem tudo — o Set dedup.
  const complete = withModuleDependencies(withOverrides);
  return [...new Set<ModuleKey>([...complete, ...ALWAYS_ON_MODULES])];
}

function resolveBaseModules(args: {
  tenantSlug: string | null | undefined;
  planFeatures: unknown;
  hasPlan: boolean;
  blocked?: boolean;
}): ModuleKey[] {
  // Inadimplente vem ANTES do acesso total: o bloqueio vale até para arena-tech,
  // senão o teste do bloqueio nunca reproduz o que o cliente vive.
  if (args.blocked) return [...NO_PLAN_MODULES];
  if (args.tenantSlug === TOTAL_ACCESS_TENANT_SLUG) return [...MODULE_KEYS];
  // Com plano, o plano manda. Sem plano, nada além do piso: desde o ADR 0061 a
  // carteira é sempre-ligada, então "tenant sem plano" e "tenant NO-KYC" viraram
  // o mesmo caso e a distinção entre eles saiu daqui.
  if (args.hasPlan) return modulesFromPlanFeatures(args.planFeatures);
  return [...NO_PLAN_MODULES];
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

/**
 * Rotas SEM gating de módulo POR DESIGN (default-allow explícito). É o allowlist
 * que torna o gating FAIL-CLOSED: uma rota que não casa um módulo (ROUTE_MODULE_
 * PREFIXES/SETTINGS_TAB_MODULE) NEM esta lista é tratada como DESCONHECIDA e
 * NEGADA. Antes o `null` significava "libera" — uma rota nova não-registrada
 * vazava pra qualquer tenant, ignorando o plano (G-P1-18, auditoria 2026-07-14).
 *
 * Só entram aqui rotas que legitimamente atravessam o gating do proxy sem módulo:
 * dashboard, dev (auto-protegida), troca de senha, tela de sem-acesso, e as abas
 * de settings SEMPRE-ON (as demais abas gateiam por módulo em SETTINGS_TAB_MODULE).
 * `/settings` (índice) e abas não-listadas caem no fallback "settings" (always-on)
 * em ROUTE_MODULE_PREFIXES, então não são `null` e não passam por aqui.
 */
/** Tela de bloqueio por inadimplência (ADR 0061): explica o motivo e cobra. */
export const BLOCKED_SUBSCRIPTION_ROUTE = "/assinatura-bloqueada";

export const UNGATED_ROUTE_PREFIXES: readonly string[] = [
  "/painel",
  "/dev",
  "/change-password",
  "/no-access",
  // A tela de bloqueio é sem-módulo por design. Precisa passar também para quem
  // NÃO está bloqueado: quando o pagamento renova a assinatura, o usuário ainda
  // está parado nela, e a própria página é quem o manda de volta ao painel.
  BLOCKED_SUBSCRIPTION_ROUTE,
  ...SETTINGS_TAB_MODULE.filter(([, mod]) => mod === null).map(([prefix]) => prefix),
];

/** True se a rota é sem-módulo por design (ver UNGATED_ROUTE_PREFIXES). */
export function isUngatedByDesign(pathname: string): boolean {
  return UNGATED_ROUTE_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
}

/** True se o módulo da rota está liberado para a lista de módulos do tenant. */
export function isPathAllowed(
  pathname: string,
  allowedModules: readonly string[],
): boolean {
  const mod = resolveModuleForPath(pathname);
  if (mod !== null) return allowedModules.includes(mod);
  // FAIL-CLOSED: sem módulo → libera SÓ se for sem-gating por design; caso
  // contrário nega (rota desconhecida/não-registrada não vaza pra o tenant).
  return isUngatedByDesign(pathname);
}

/**
 * Rotas que um tenant com assinatura suspensa ainda abre (ADR 0061).
 *
 * Lista explícita, por exclusão: rota nova nasce bloqueada até alguém declarar
 * o contrário aqui. É o mesmo fail-closed de `isPathAllowed`. Só entram as que
 * o cliente precisa para sair do bloqueio ou para mexer no que é dele:
 *
 * - a própria tela de bloqueio e a de pagar a assinatura;
 * - `/settings/security`, porque 2FA é pré-requisito de saque DePix e a conta é
 *   do próprio usuário;
 * - carteira e link de cobrança, porque o saldo é do cliente e reter dinheiro
 *   alheio como alavanca de cobrança seria abuso;
 * - trocar de tenant, trocar senha e sair, que são rotas de sessão.
 *
 * Reconfigurar a loja (`/settings/general`, equipe, formas de pagamento) fica
 * de fora de propósito: conta suspensa não é conta em operação.
 */
const ROUTES_ALLOWED_WHILE_BLOCKED: readonly string[] = [
  BLOCKED_SUBSCRIPTION_ROUTE,
  "/settings/subscription",
  "/settings/security",
  "/settings/depix",
  "/depix-wallet",
  "/depix",
  "/quick-sales",
  "/select-tenant",
  "/change-password",
  "/logout",
];

/** True se a rota segue aberta para um tenant suspenso por inadimplência. */
export function isRouteAllowedWhileBlocked(pathname: string): boolean {
  return ROUTES_ALLOWED_WHILE_BLOCKED.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * Autorização de rota do tenant, combinando as duas dimensões de gating:
 * 1. Restrição por SLUG (ferramentas internas — allowlist explícita de slugs).
 * 2. Gating por MÓDULO/plano (isPathAllowed).
 * Uma rota restrita por slug exige que o tenant esteja na allowlist E que o
 * módulo (se houver) esteja liberado. É a função que o proxy deve usar.
 */
export function isRouteAllowedForTenant(
  pathname: string,
  tenant: { slug: string | null | undefined; modules: readonly string[] },
): boolean {
  const slugAllowlist = slugAllowlistForPath(pathname);
  if (slugAllowlist) {
    // Rota restrita por SLUG: o slug É a dimensão de gating (allowlist explícita).
    // Passou o slug → permitida — NÃO aplicar o fail-closed de módulo (a rota é
    // sem-módulo por design, ex.: iphone-hunter). Ainda respeita o módulo se a
    // rota tiver um.
    if (!slugAllowlist.includes(tenant.slug ?? "")) return false;
    const mod = resolveModuleForPath(pathname);
    return mod === null || tenant.modules.includes(mod);
  }
  return isPathAllowed(pathname, tenant.modules);
}
