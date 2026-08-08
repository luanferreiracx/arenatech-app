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
 * - Tenant sem plano (NO-KYC = estado inicial): só o piso. A ativação atribui um
 *   plano ativo, que define os módulos (mesmo sem CNPJ).
 *
 * Duas dimensões de gating de ROTA (ver `isRouteAllowedForTenant`, usada no proxy):
 * 1. Módulo/plano — a maioria das rotas casa um prefixo em ROUTE_MODULE_PREFIXES.
 * 2. Slug — ferramentas internas restritas a um tenant (SLUG_RESTRICTED_ROUTES).
 *
 * Rotas sem módulo nem restrição de slug passam livres (painel, troca de tenant).
 * `settings` é SEMPRE-ON (ALWAYS_ON_MODULES): todo tenant configura a própria
 * loja, independente do plano. `/settings/security` também (2FA é pré-requisito
 * de saque DePix). Ambos ficam fora da matriz de plano. `wallet`/`depix-ops`
 * (WALLET_FLOOR_MODULES) também ficam fora da matriz, mas condicionados ao gate
 * `Tenant.depixEnabled`.
 */

export const MODULE_KEYS = [
  "wallet", // DePix Wallet/LWK: carteira, saldos e saques (/depix-wallet)
  "depix-ops", // Operações DePix wallet-backed: vendas avulsas (/quick-sales)
  "service-orders", // Assistência: OS, serviços, operação, comunicação
  "customers", // Clientes e interesses
  "tools", // Simulador de parcelamento e avaliação de aparelho
  "imei-lookup", // Consulta de IMEI/NF-e. APOSENTADO — ver RETIRED_MODULES.
  "pdv", // Base de vendas: caixa, histórico e RECEBIMENTO de OS
  "pdv-retail", // Venda livre no PDV (o que separa varejo de assistência)
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
  tools: "Ferramentas (Simulador e Avaliação)",
  "imei-lookup": "Consultas IMEI/NF-e (aposentado)",
  pdv: "Vendas — base (caixa, histórico, recebimento de OS)",
  "pdv-retail": "Venda livre no PDV",
  stock: "Estoque",
  cashier: "Caixa",
  financial: "Financeiro",
  fiscal: "Fiscal / NF-e",
  commissions: "Comissões",
  settings: "Configurações",
  "partner-api": "API de Parceiros",
};

/**
 * Módulos APOSENTADOS: o código fica inteiro, o recurso não é oferecido a
 * ninguém — nem por plano, nem pelo tenant de acesso total.
 *
 * `imei-lookup` (decisão do dono, 2026-08-02): a consulta de IMEI/NF-e teve 3
 * usos em produção, o último em 29/05. Aposentar em vez de apagar preserva
 * router, telas, schema e histórico; voltar a oferecer é tirar a chave desta
 * lista.
 *
 * Um plano legado cujo `features.modules` ainda cite um módulo aposentado NÃO o
 * ressuscita: `modulesFromPlanFeatures` filtra na leitura. Aposentadoria que
 * depende de ninguém ter guardado a chave antiga não é aposentadoria.
 */
export const RETIRED_MODULES: ModuleKey[] = ["imei-lookup"];

const RETIRED_MODULE_SET = new Set<string>(RETIRED_MODULES);

/** True se o módulo está aposentado (código preservado, recurso não oferecido). */
export function isRetiredModule(value: string): boolean {
  return RETIRED_MODULE_SET.has(value);
}

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
 * - `pdv-retail` → `pdv`: a venda livre é uma CAPACIDADE dentro do PDV, não um
 *   PDV paralelo. Ver a nota abaixo.
 * - `service-orders` → `pdv` (OS é paga via PDV — createFromOS) + `customers`
 *   (produto: uma OS é sempre de um cliente).
 * - `depix-ops` → `wallet` (quick-sale cria depósito na carteira).
 * - `fiscal` → `pdv` (NF-e é emitida a partir de uma venda).
 * - `commissions` → `pdv` (comissão deriva de venda/OS).
 *
 * ## Por que `pdv` foi partido em dois (decisão do dono, 2026-08-02)
 *
 * O plano de assistência precisa RECEBER o valor de uma OS, e isso passa pelo
 * PDV (`sale.createFromOS`). Enquanto "PDV" era um módulo só, vender assistência
 * sem varejo era impossível: o plano de OS arrastava a venda livre junto, e o
 * plano de varejo virava subconjunto do de assistência — dois planos, um deles
 * sem razão de existir.
 *
 * A separação é onde os dois fluxos realmente divergem no código: `/pdv` sem
 * `?saleId` chama `sale.createDraft` e abre uma venda livre; com `?saleId` está
 * pagando uma OS, e o rascunho veio de `createFromOS`. `pdv` é a base
 * (caixa, histórico, recebimento de OS); `pdv-retail` é abrir venda do zero.
 */
export const MODULE_DEPENDENCIES: Partial<Record<ModuleKey, ModuleKey[]>> = {
  pdv: ["cashier", "financial", "stock", "customers"],
  "pdv-retail": ["pdv"],
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
 * Módulos SEMPRE ligados para TODO tenant, independente do plano e do gate de
 * DePix. Ficam fora do editor de plano e sobrevivem à suspensão por
 * inadimplência (ADR 0061 — o bloqueio suave preserva exatamente este piso).
 *
 * - `settings`: todo tenant configura a própria loja (formas de pagamento,
 *   equipe, integrações). Como `/settings/security` já era.
 *
 * `partner-api` também não depende de plano, mas NÃO entra aqui: continua sob o
 * override por tenant `apiAccessEnabled` (ADR 0057), que é controle de segurança
 * e não de pacote.
 */
export const ALWAYS_ON_MODULES: ModuleKey[] = ["settings"];

/**
 * Piso da CARTEIRA: sempre-ligado para quem tem DePix habilitado.
 *
 * O ADR 0061 pôs `wallet` e `depix-ops` no piso incondicional com um argumento
 * que continua inteiro: a carteira guarda o DINHEIRO do cliente, e nenhuma
 * decisão comercial nossa pode separá-lo dele, nem quando ele deve — reter saldo
 * alheio como alavanca de cobrança seria abuso, além de risco regulatório.
 *
 * O que mudou não é esse princípio, é o alcance. Piso INCONDICIONAL significa
 * que abrir cadastro joga 100% dos clientes novos na superfície mais frágil do
 * sistema (Esplora pública, cache do LWK, off-ramp de terceiro), inclusive quem
 * contratou para vender celular e nunca vai tocar em DePix. O princípio protege
 * quem TEM dinheiro na carteira; não obriga a dar carteira a quem não pediu.
 *
 * Então o piso virou condicional a `Tenant.depixEnabled`, e a proteção do ADR
 * 0061 é preservada por duas travas: a suspensão por inadimplência NÃO derruba
 * este piso (mesmo caminho de antes), e o gate não pode ser desligado com
 * carteira provisionada (`admin.setDepixEnabled`).
 */
export const WALLET_FLOOR_MODULES: ModuleKey[] = ["wallet", "depix-ops"];

/**
 * Módulos selecionáveis no editor de PLANO. Quatro exclusões, por motivos
 * diferentes:
 *
 * - override por-tenant (`partner-api`): quem libera é o superadmin, não o plano;
 * - sempre-ligados (`settings`): todo tenant tem, não se vende;
 * - piso da carteira: condicionado a `Tenant.depixEnabled`, também fora do plano;
 * - aposentados: o código fica, o recurso não é oferecido a ninguém.
 */
export const PLAN_SELECTABLE_MODULES: ModuleKey[] = MODULE_KEYS.filter(
  (m) =>
    !PER_TENANT_OVERRIDE_MODULES.includes(m) &&
    !ALWAYS_ON_MODULES.includes(m) &&
    !WALLET_FLOOR_MODULES.includes(m) &&
    !isRetiredModule(m),
);

/**
 * Este módulo é vendido por plano? Aceita `string` porque o chamador típico lê
 * `features.modules` do banco, que é JSON — pode conter chave desconhecida
 * (módulo removido do código, plano legado). Chave desconhecida não é
 * selecionável, então a resposta é `false` e o caminho é o seguro.
 */
export function isPlanSelectableModule(module: string): boolean {
  return (PLAN_SELECTABLE_MODULES as readonly string[]).includes(module);
}

/** Slug do tenant com acesso total (bypass do gating). */
export const TOTAL_ACCESS_TENANT_SLUG = "arena-tech";

/**
 * Rotas restritas a slugs específicos, INDEPENDENTE de módulo/plano. Ferramentas
 * internas que não pertencem a nenhum módulo comercializável. Sem isto, a rota
 * não casa nenhum prefixo de módulo → `resolveModuleForPath` retorna null →
 * passaria livre por URL para qualquer tenant, ainda que o menu a esconda (o
 * menu usa `requiresTenantSlug`, que não bloqueia a rota).
 * `isRouteAllowedForTenant` fecha esse buraco.
 *
 * **Vazio hoje** (2026-08-08): o único usuário era `/iphone-hunter`, removido
 * com o módulo. O mecanismo fica porque o buraco que ele fecha é real — a
 * próxima ferramenta interna sem módulo precisa entrar aqui, não só no menu.
 */
const SLUG_RESTRICTED_ROUTES: ReadonlyArray<readonly [string, readonly string[]]> = [
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
 * `["wallet", "depix-ops"]`. O ADR 0061 moveu esses dois para o piso, o que
 * zerou as duas listas e apagou a distinção entre elas: sem plano, o tenant tem
 * o piso e mais nada. Uma constante vazia é mais honesta que duas listas iguais
 * e um `if` que finge escolher.
 *
 * Desde o gate `depixEnabled`, o piso da carteira é condicional — mas continua
 * sendo piso, somado depois desta lista, e não módulo de plano.
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
  // Conexão do WhatsApp da loja (Cloud API, credencial própria). Gateada por
  // `customers` porque é aí que mora o contato com o cliente — e todo plano do
  // catálogo inclui `customers`, então na prática toda loja que contrata pode
  // conectar o WhatsApp dela. Não é `service-orders`: mensagem para cliente
  // serve varejo e assistência igualmente.
  ["/settings/whatsapp", "customers"],
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
  ["/imei", "imei-lookup"], // aposentado — ninguém tem o módulo, a rota fecha

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

  const parsed = raw.filter(
    (m): m is ModuleKey => typeof m === "string" && isModuleKey(m) && !isRetiredModule(m),
  );
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
  /**
   * Gate da carteira DePix. Quando ligado, `wallet`/`depix-ops` entram no piso e
   * sobrevivem até à suspensão por inadimplência (ADR 0061). Quando desligado, o
   * tenant nunca é exposto à carteira.
   */
  depixEnabled?: boolean;
}): ModuleKey[] {
  const base = resolveBaseModules(args);
  const withOverrides = applyPerTenantOverrides(base, args);
  // Auto-inclui pré-requisitos (plano quebrado não vira acesso quebrado) e soma
  // o piso. arena-tech já tem tudo — o Set dedup.
  const complete = withModuleDependencies(withOverrides);
  const floor = args.depixEnabled
    ? [...ALWAYS_ON_MODULES, ...WALLET_FLOOR_MODULES]
    : ALWAYS_ON_MODULES;
  // O piso é somado DEPOIS de `resolveBaseModules`, que zera tudo quando
  // `blocked`. É essa ordem que faz o bloqueio suave do ADR 0061 funcionar: o
  // inadimplente perde os módulos pagos e mantém carteira e configurações.
  return [...new Set<ModuleKey>([...complete, ...floor])];
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
  // Nem o acesso total ressuscita um módulo aposentado: "morto" que continua
  // vivo na loja do dono não é morto, é exceção esquecida.
  if (args.tenantSlug === TOTAL_ACCESS_TENANT_SLUG) {
    return MODULE_KEYS.filter((m) => !isRetiredModule(m));
  }
  // Com plano, o plano manda. Sem plano, nada além do piso: desde o ADR 0061 a
  // carteira entra por fora da matriz de plano, então "tenant sem plano" e
  // "tenant NO-KYC" viraram o mesmo caso e a distinção entre eles saiu daqui.
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
