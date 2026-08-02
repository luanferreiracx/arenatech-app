import { describe, it, expect } from "vitest";
import {
  resolveModuleForPath,
  modulesFromPlanFeatures,
  allowedModulesForTenant,
  isPathAllowed,
  withModuleDependencies,
  modulesRequiredBySelection,
  MODULE_KEYS,
  NO_PLAN_MODULES,
  TOTAL_ACCESS_TENANT_SLUG,
  ALWAYS_ON_MODULES,
  WALLET_FLOOR_MODULES,
  PLAN_SELECTABLE_MODULES,
  isRouteAllowedWhileBlocked,
  BLOCKED_SUBSCRIPTION_ROUTE,
  RETIRED_MODULES,
  isRetiredModule,
  MODULE_LABELS,
} from "@/lib/modules";

// Comparação robusta a ordem (a expansão de dependências não garante ordem).
const asSet = (mods: readonly string[]) => [...mods].sort();

describe("resolveModuleForPath", () => {
  it("mapeia Wallet e redirects legados /depix para wallet; vendas avulsas para depix-ops", () => {
    expect(resolveModuleForPath("/depix-wallet")).toBe("wallet");
    expect(resolveModuleForPath("/depix/withdrawals")).toBe("wallet");
    expect(resolveModuleForPath("/quick-sales")).toBe("depix-ops");
  });

  it("mapeia /financial para financial (sem roubar as rotas DePix)", () => {
    expect(resolveModuleForPath("/financial")).toBe("financial");
    expect(resolveModuleForPath("/financial/dre")).toBe("financial");
  });

  it("mapeia rotas dos demais módulos", () => {
    expect(resolveModuleForPath("/service-orders")).toBe("service-orders");
    expect(resolveModuleForPath("/service-orders/new")).toBe("service-orders");
    expect(resolveModuleForPath("/customers")).toBe("customers");
    expect(resolveModuleForPath("/simulator")).toBe("tools");
    expect(resolveModuleForPath("/valuations")).toBe("tools");
    expect(resolveModuleForPath("/pdv")).toBe("pdv");
    expect(resolveModuleForPath("/stock")).toBe("stock");
    expect(resolveModuleForPath("/aparelhos-catalogo")).toBe("stock");
    expect(resolveModuleForPath("/cashier")).toBe("cashier");
    expect(resolveModuleForPath("/fiscal")).toBe("fiscal");
    expect(resolveModuleForPath("/reports")).toBe("fiscal");
    expect(resolveModuleForPath("/commissions")).toBe("commissions");
  });

  it("retorna null para rotas sem gating (painel, troca de tenant)", () => {
    expect(resolveModuleForPath("/painel")).toBeNull();
    expect(resolveModuleForPath("/select-tenant")).toBeNull();
  });

  it("cada aba de settings é gateada pelo módulo funcional de que depende", () => {
    // Um tenant só-wallet não deve ver Fiscal, Formas de Pagamento, Cartões etc.
    expect(resolveModuleForPath("/settings/fiscal")).toBe("fiscal");
    expect(resolveModuleForPath("/settings/payment-methods")).toBe("pdv");
    expect(resolveModuleForPath("/settings/card-acquirers")).toBe("pdv");
    expect(resolveModuleForPath("/settings/receiving")).toBe("pdv");
    expect(resolveModuleForPath("/settings/installments")).toBe("tools");
    expect(resolveModuleForPath("/settings/integrations")).toBe("tools");
    expect(resolveModuleForPath("/settings/assistance")).toBe("service-orders");
    expect(resolveModuleForPath("/settings/delivery-persons")).toBe("service-orders");
    expect(resolveModuleForPath("/settings/depix")).toBe("wallet");
    expect(resolveModuleForPath("/settings/partner-api")).toBe("partner-api");
  });

  it("abas sempre-on (dados da loja/equipe/plano/auditoria/2FA) nunca gateadas", () => {
    // Tenants wallet/NO-KYC precisam habilitar 2FA pra sacar e ver plano/equipe —
    // essas abas nao podem ser bloqueadas por modulo, senao ficam num beco.
    expect(resolveModuleForPath("/settings/security")).toBeNull();
    expect(resolveModuleForPath("/settings/security/anything")).toBeNull();
    expect(resolveModuleForPath("/settings/general")).toBeNull();
    expect(resolveModuleForPath("/settings/users")).toBeNull();
    expect(resolveModuleForPath("/settings/subscription")).toBeNull();
    expect(resolveModuleForPath("/settings/logs")).toBeNull();
    // Visíveis a um tenant só-wallet (sem 'settings' na lista sequer):
    const walletOnly = ["wallet", "depix-ops"];
    expect(isPathAllowed("/settings/security", walletOnly)).toBe(true);
    expect(isPathAllowed("/settings/general", walletOnly)).toBe(true);
    expect(isPathAllowed("/settings/subscription", walletOnly)).toBe(true);
    // Bloqueadas pro mesmo tenant só-wallet:
    expect(isPathAllowed("/settings/fiscal", walletOnly)).toBe(false);
    expect(isPathAllowed("/settings/payment-methods", walletOnly)).toBe(false);
  });

  it("não casa prefixo parcial de outra rota (/stockfoo)", () => {
    expect(resolveModuleForPath("/stockfoo")).toBeNull();
  });
});

describe("modulesFromPlanFeatures", () => {
  it("lê features.modules quando presente", () => {
    expect(modulesFromPlanFeatures({ modules: ["wallet", "pdv"] })).toEqual(["wallet", "pdv"]);
  });

  it("ignora valores inválidos", () => {
    expect(modulesFromPlanFeatures({ modules: ["wallet", "inexistente", 42] })).toEqual(["wallet"]);
  });

  it("plano sem modules não libera módulo PAGO nenhum", () => {
    expect(modulesFromPlanFeatures(null)).toEqual(NO_PLAN_MODULES);
    expect(modulesFromPlanFeatures({})).toEqual(NO_PLAN_MODULES);
  });

  it("modules vazio ou só com lixo não libera módulo PAGO nenhum", () => {
    expect(modulesFromPlanFeatures({ modules: [] })).toEqual(NO_PLAN_MODULES);
    expect(modulesFromPlanFeatures({ modules: ["inexistente", 42] })).toEqual(NO_PLAN_MODULES);
  });
});

describe("withModuleDependencies (auto-inclusão de pré-requisitos)", () => {
  it("pdv puxa cashier + financial + stock + customers", () => {
    expect(asSet(withModuleDependencies(["pdv"]))).toEqual(
      ["cashier", "customers", "financial", "pdv", "stock"],
    );
  });

  it("service-orders puxa pdv e, por transitividade, cashier+financial+stock+customers", () => {
    expect(asSet(withModuleDependencies(["service-orders"]))).toEqual(
      ["cashier", "customers", "financial", "pdv", "service-orders", "stock"],
    );
  });

  it("depix-ops puxa wallet", () => {
    expect(asSet(withModuleDependencies(["depix-ops"]))).toEqual(["depix-ops", "wallet"]);
  });

  it("módulo sem dependência fica inalterado; é idempotente", () => {
    expect(withModuleDependencies(["tools"])).toEqual(["tools"]);
    expect(asSet(withModuleDependencies(["pdv", "cashier"]))).toEqual(
      ["cashier", "customers", "financial", "pdv", "stock"],
    );
  });
});

describe("modulesRequiredBySelection (editor de plano: travar exigidos)", () => {
  it("com pdv na seleção, cashier+financial+stock+customers ficam exigidos (não pdv)", () => {
    const required = modulesRequiredBySelection(["pdv"]);
    expect(required.has("cashier")).toBe(true);
    expect(required.has("financial")).toBe(true);
    expect(required.has("stock")).toBe(true);
    expect(required.has("customers")).toBe(true);
    expect(required.has("pdv")).toBe(false); // pdv não é dependência de ninguém aqui
  });

  it("sem dependências, nada é exigido", () => {
    expect(modulesRequiredBySelection(["customers", "tools"]).size).toBe(0);
  });

  it("cashier fica travado mesmo estando também na seleção, enquanto pdv o exige", () => {
    // robusto a "direto vs auto-incluído": quem importa é se ALGUÉM depende dele.
    expect(modulesRequiredBySelection(["pdv", "cashier", "financial"]).has("cashier")).toBe(true);
    // sem pdv, cashier deixa de ser exigido (pode desmarcar).
    expect(modulesRequiredBySelection(["cashier"]).size).toBe(0);
  });
});

describe("catálogo de módulos", () => {
  it("settings é sempre-on e NÃO aparece no editor de plano", () => {
    expect(ALWAYS_ON_MODULES).toContain("settings");
    expect(PLAN_SELECTABLE_MODULES).not.toContain("settings");
    expect(PLAN_SELECTABLE_MODULES).not.toContain("partner-api"); // override por-tenant
  });

  // ADR 0061: a carteira guarda o DINHEIRO do cliente. Vendê-la como item de
  // plano permitiria tirá-la de quem deve — e reter saldo alheio como alavanca
  // de cobrança seria abuso. Guardião: se alguém devolver `wallet` para a matriz
  // de plano, este teste cai.
  it("carteira DePix e link de cobrança ficam fora do editor de plano", () => {
    expect(WALLET_FLOOR_MODULES).toContain("wallet");
    expect(WALLET_FLOOR_MODULES).toContain("depix-ops");
    expect(PLAN_SELECTABLE_MODULES).not.toContain("wallet");
    expect(PLAN_SELECTABLE_MODULES).not.toContain("depix-ops");
  });
});

describe("gate da carteira DePix (Tenant.depixEnabled)", () => {
  const loja = { tenantSlug: "loja-x", planFeatures: { modules: ["pdv"] }, hasPlan: true };

  it("sem o gate, o tenant nunca é exposto à carteira", () => {
    // O motivo de existir do gate: abrir cadastro não pode jogar 100% dos
    // clientes novos na superfície mais frágil do sistema.
    const mods = allowedModulesForTenant(loja);
    expect(mods).not.toContain("wallet");
    expect(mods).not.toContain("depix-ops");
  });

  it("com o gate, a carteira entra como piso", () => {
    const mods = allowedModulesForTenant({ ...loja, depixEnabled: true });
    expect(mods).toContain("wallet");
    expect(mods).toContain("depix-ops");
  });

  it("suspenso por inadimplência MANTÉM a carteira (ADR 0061)", () => {
    // A trava que preserva o princípio do ADR 0061: o cliente que deve continua
    // alcançando o próprio dinheiro. Perde os módulos pagos, não o saldo.
    const mods = allowedModulesForTenant({ ...loja, depixEnabled: true, blocked: true });
    expect(mods).toContain("wallet");
    expect(mods).toContain("depix-ops");
    expect(mods).toContain("settings");
    expect(mods).not.toContain("pdv");
  });

  it("suspenso SEM o gate não ganha carteira por causa do bloqueio", () => {
    const mods = allowedModulesForTenant({ ...loja, blocked: true });
    expect(mods).not.toContain("wallet");
    expect(mods).toEqual([...ALWAYS_ON_MODULES]);
  });

  it("acesso total (arena-tech) tem a carteira de qualquer jeito", () => {
    const mods = allowedModulesForTenant({
      tenantSlug: "arena-tech",
      planFeatures: null,
      hasPlan: false,
    });
    expect(mods).toContain("wallet");
  });
});

describe("allowedModulesForTenant", () => {
  // settings é sempre-on; pdv auto-inclui cashier+financial; service-orders/fiscal/
  // commissions auto-incluem pdv (e por transitividade cashier+financial).
  it("arena-tech tem acesso total, EXCETO módulo aposentado", () => {
    const mods = allowedModulesForTenant({
      tenantSlug: TOTAL_ACCESS_TENANT_SLUG,
      planFeatures: { modules: ["wallet"] },
      hasPlan: true,
    });
    // "Morto" que continua vivo na loja do dono não é morto, é exceção
    // esquecida — e a exceção esquecida é o que faz o recurso voltar sem
    // ninguém decidir.
    const esperado = MODULE_KEYS.filter((m) => !isRetiredModule(m));
    expect(asSet(mods)).toEqual(asSet([...esperado]));
    expect(mods).not.toContain("imei-lookup");
  });

  it("tenant sem plano fica só com o piso sempre-on (carteira, cobrança, settings)", () => {
    expect(
      asSet(allowedModulesForTenant({ tenantSlug: "loja-x", planFeatures: null, hasPlan: false })),
    ).toEqual(asSet([...ALWAYS_ON_MODULES]));
  });

  it("tenant com plano usa o que o plano libera + pré-requisitos + settings", () => {
    // Sem `depixEnabled`, a carteira NÃO entra: quem contratou para vender
    // celular não é exposto à superfície de DePix.
    expect(
      asSet(allowedModulesForTenant({
        tenantSlug: "loja-x",
        planFeatures: { modules: ["pdv"] },
        hasPlan: true,
      })),
    ).toEqual(
      asSet(["pdv", "cashier", "financial", "stock", "customers", "settings"]),
    );
  });

  it("tenant sem documento (slug opaco) segue a mesma regra: plano manda", () => {
    // Antes do ADR 0061 havia um teto rígido em `wallet` para tenant NO-KYC.
    // Com a carteira sempre-ligada, "sem documento" e "sem plano" deixaram de
    // ser dimensões separadas de gating: quem tem plano tem o plano.
    expect(
      asSet(allowedModulesForTenant({
        tenantSlug: "pdv-7f3a9c",
        planFeatures: { modules: ["pdv", "stock", "financial"] },
        hasPlan: true,
      })),
    ).toEqual(
      asSet(["pdv", "stock", "financial", "cashier", "customers", "settings"]),
    );
  });

  it("plano parcial libera o plano + pré-requisitos (service-orders→pdv→...)", () => {
    expect(
      asSet(allowedModulesForTenant({
        tenantSlug: "pdv-x",
        planFeatures: { modules: ["service-orders", "customers"] },
        hasPlan: true,
      })),
    ).toEqual(
      asSet([
        "service-orders", "customers",
        "pdv", "cashier", "financial", "stock", "settings",
      ]),
    );
  });
});

// ── ADR 0061 — bloqueio suave por inadimplência ──
//
// Antes, suspender significava expulsar: o tenant sumia da sessão, o proxy o
// mandava para `/no-access` ("não está vinculada a nenhuma loja") e a tela de
// pagar, sendo rota de tenant, ficava inalcançável. Estes testes fixam o
// contrário: quem deve perde os módulos PAGOS e mantém o piso.
describe("allowedModulesForTenant — tenant bloqueado por inadimplência", () => {
  const paidPlan = { modules: ["pdv", "service-orders", "fiscal"] };

  it("derruba os módulos pagos do plano", () => {
    const mods = allowedModulesForTenant({
      tenantSlug: "loja-x",
      planFeatures: paidPlan,
      hasPlan: true,
      blocked: true,
    });
    expect(mods).not.toContain("pdv");
    expect(mods).not.toContain("service-orders");
    expect(mods).not.toContain("stock");
    expect(mods).not.toContain("financial");
  });

  it("mantém carteira, link de cobrança e configurações — o saldo é do cliente", () => {
    expect(
      asSet(allowedModulesForTenant({
        tenantSlug: "loja-x",
        planFeatures: paidPlan,
        hasPlan: true,
        blocked: true,
      })),
    ).toEqual(asSet([...ALWAYS_ON_MODULES]));
  });

  it("não derruba a API de parceiros: o override do superadmin não é item de plano", () => {
    const mods = allowedModulesForTenant({
      tenantSlug: "loja-x",
      planFeatures: paidPlan,
      hasPlan: true,
      blocked: true,
      apiAccessEnabled: true,
    });
    expect(mods).toContain("partner-api");
    expect(mods).not.toContain("pdv");
  });

  it("o bloqueio vale até para o tenant de acesso total", () => {
    // Senão o bloqueio nunca seria reproduzível na loja em que o dono testa.
    const mods = allowedModulesForTenant({
      tenantSlug: TOTAL_ACCESS_TENANT_SLUG,
      planFeatures: null,
      hasPlan: false,
      blocked: true,
    });
    expect(asSet(mods)).toEqual(asSet([...ALWAYS_ON_MODULES]));
  });

  it("sem `blocked`, o mesmo plano libera tudo (o bloqueio é a única diferença)", () => {
    const mods = allowedModulesForTenant({
      tenantSlug: "loja-x",
      planFeatures: paidPlan,
      hasPlan: true,
    });
    expect(mods).toContain("pdv");
    expect(mods).toContain("service-orders");
  });
});

describe("isRouteAllowedWhileBlocked", () => {
  it("abre o caminho de volta: tela de bloqueio e pagamento da assinatura", () => {
    expect(isRouteAllowedWhileBlocked(BLOCKED_SUBSCRIPTION_ROUTE)).toBe(true);
    expect(isRouteAllowedWhileBlocked("/settings/subscription")).toBe(true);
  });

  it("abre a carteira e o link de cobrança — dinheiro do cliente", () => {
    expect(isRouteAllowedWhileBlocked("/depix-wallet")).toBe(true);
    expect(isRouteAllowedWhileBlocked("/depix-wallet/saques")).toBe(true);
    expect(isRouteAllowedWhileBlocked("/quick-sales")).toBe(true);
  });

  it("abre 2FA (pré-requisito de saque) e as rotas de sessão", () => {
    expect(isRouteAllowedWhileBlocked("/settings/security")).toBe(true);
    expect(isRouteAllowedWhileBlocked("/select-tenant")).toBe(true);
    expect(isRouteAllowedWhileBlocked("/change-password")).toBe(true);
    expect(isRouteAllowedWhileBlocked("/logout")).toBe(true);
  });

  it("FAIL-CLOSED: fecha operação, painel e o resto das configurações", () => {
    expect(isRouteAllowedWhileBlocked("/pdv")).toBe(false);
    expect(isRouteAllowedWhileBlocked("/service-orders")).toBe(false);
    expect(isRouteAllowedWhileBlocked("/painel")).toBe(false);
    expect(isRouteAllowedWhileBlocked("/settings/general")).toBe(false);
    expect(isRouteAllowedWhileBlocked("/rota-nova-qualquer")).toBe(false);
  });

  it("não casa por prefixo solto (`/depix-wallet-outra` não é `/depix-wallet`)", () => {
    expect(isRouteAllowedWhileBlocked("/depix-wallet-outra")).toBe(false);
    expect(isRouteAllowedWhileBlocked("/settings/subscription-x")).toBe(false);
  });
});

// ── Módulos aposentados: código preservado, recurso não oferecido ──
describe("RETIRED_MODULES", () => {
  it("não aparece no editor de plano", () => {
    for (const retirado of RETIRED_MODULES) {
      expect(PLAN_SELECTABLE_MODULES).not.toContain(retirado);
    }
  });

  it("plano legado que ainda cite o módulo NÃO o ressuscita", () => {
    // A aposentadoria não pode depender de ninguém ter guardado a chave antiga:
    // o filtro é na LEITURA do plano, não só no editor.
    const modules = modulesFromPlanFeatures({ modules: ["pdv", "imei-lookup"] });
    expect(modules).toContain("pdv");
    expect(modules).not.toContain("imei-lookup");
  });

  it("nenhum tenant recebe o módulo, com ou sem plano", () => {
    const comPlano = allowedModulesForTenant({
      tenantSlug: "loja-x",
      planFeatures: { modules: ["imei-lookup", "pdv"] },
      hasPlan: true,
    });
    const semPlano = allowedModulesForTenant({
      tenantSlug: "loja-y",
      planFeatures: null,
      hasPlan: false,
    });
    expect(comPlano).not.toContain("imei-lookup");
    expect(semPlano).not.toContain("imei-lookup");
  });

  it("a rota do módulo aposentado fica fechada para todos", () => {
    expect(resolveModuleForPath("/imei")).toBe("imei-lookup");
    // Sem o módulo na lista, `isPathAllowed` nega — e ninguém tem o módulo.
    expect(isPathAllowed("/imei", ["pdv", "pdv-retail", "stock"])).toBe(false);
  });

  it("o código continua lá: a chave existe no catálogo e tem rótulo", () => {
    // Aposentar ≠ apagar. Se um dia voltar, é tirar de RETIRED_MODULES.
    expect(MODULE_KEYS).toContain("imei-lookup");
    expect(MODULE_LABELS["imei-lookup"]).toBeTruthy();
  });
});

// ── pdv vs pdv-retail: a trava que separa assistência de varejo ──
//
// O plano de assistência precisa RECEBER o valor de uma OS, e isso passa pelo
// PDV. Enquanto "PDV" era um módulo só, o plano de OS arrastava a venda livre
// junto e o plano de varejo virava subconjunto dele — dois planos, um sem razão
// de existir.
describe("pdv-retail (venda livre) separado de pdv (base)", () => {
  const planoAssistencia = { modules: ["service-orders"] };
  const planoVarejo = { modules: ["pdv-retail"] };

  it("assistência recebe o PDV base (para receber OS) mas NÃO a venda livre", () => {
    const mods = allowedModulesForTenant({
      tenantSlug: "loja-os",
      planFeatures: planoAssistencia,
      hasPlan: true,
    });
    expect(mods).toContain("service-orders");
    expect(mods).toContain("pdv");
    expect(mods).not.toContain("pdv-retail");
  });

  it("varejo recebe a venda livre e o PDV base, sem assistência", () => {
    const mods = allowedModulesForTenant({
      tenantSlug: "loja-varejo",
      planFeatures: planoVarejo,
      hasPlan: true,
    });
    expect(mods).toContain("pdv-retail");
    expect(mods).toContain("pdv");
    expect(mods).not.toContain("service-orders");
  });

  it("os dois planos puxam a mesma base operacional (caixa, estoque, financeiro)", () => {
    const assistencia = allowedModulesForTenant({
      tenantSlug: "a", planFeatures: planoAssistencia, hasPlan: true,
    });
    const varejo = allowedModulesForTenant({
      tenantSlug: "b", planFeatures: planoVarejo, hasPlan: true,
    });
    for (const base of ["cashier", "financial", "stock", "customers"]) {
      expect(assistencia).toContain(base);
      expect(varejo).toContain(base);
    }
  });

  it("`/pdv` abre nos dois: é por lá que a OS é recebida", () => {
    const assistencia = allowedModulesForTenant({
      tenantSlug: "a", planFeatures: planoAssistencia, hasPlan: true,
    });
    expect(isPathAllowed("/pdv", assistencia)).toBe(true);
    expect(isPathAllowed("/pdv/history", assistencia)).toBe(true);
  });

  it("nenhum plano é subconjunto do outro — é o que justifica vender os dois", () => {
    const assistencia = new Set(
      allowedModulesForTenant({ tenantSlug: "a", planFeatures: planoAssistencia, hasPlan: true }),
    );
    const varejo = new Set(
      allowedModulesForTenant({ tenantSlug: "b", planFeatures: planoVarejo, hasPlan: true }),
    );
    expect([...assistencia].some((m) => !varejo.has(m))).toBe(true);
    expect([...varejo].some((m) => !assistencia.has(m))).toBe(true);
  });
});

describe("isPathAllowed", () => {
  it("libera rota sem-gating POR DESIGN", () => {
    expect(isPathAllowed("/painel", [])).toBe(true);
    expect(isPathAllowed("/change-password", [])).toBe(true);
    expect(isPathAllowed("/settings/security", [])).toBe(true); // aba sempre-on
  });

  it("FAIL-CLOSED: nega rota desconhecida sem módulo (não vaza pra o tenant)", () => {
    expect(isPathAllowed("/rota-desconhecida", [])).toBe(false);
    expect(isPathAllowed("/rota-desconhecida", ["pdv", "stock"])).toBe(false);
  });

  it("bloqueia rota de módulo não liberado", () => {
    expect(isPathAllowed("/pdv", ["wallet"])).toBe(false);
    expect(isPathAllowed("/service-orders", ["wallet"])).toBe(false);
    expect(isPathAllowed("/settings", ["wallet"])).toBe(false);
  });

  it("libera rota de módulo liberado", () => {
    expect(isPathAllowed("/depix-wallet", ["wallet"])).toBe(true);
    expect(isPathAllowed("/pdv", ["wallet", "pdv"])).toBe(true);
  });
});

describe("partner-api — módulo com override por-tenant (ADR 0057)", () => {
  it("/settings/partner-api resolve pro módulo partner-api (não settings)", () => {
    expect(resolveModuleForPath("/settings/partner-api")).toBe("partner-api");
    expect(resolveModuleForPath("/settings/partner-api/x")).toBe("partner-api");
    // Geral é sempre-on (null), não mais o genérico settings.
    expect(resolveModuleForPath("/settings/general")).toBeNull();
  });

  it("apiAccessEnabled libera partner-api por override (tenant wallet-only sem plano)", () => {
    const mods = allowedModulesForTenant({
      tenantSlug: "pdv-x",
      hasPlan: false, // cai no default (wallet, depix-ops)
      planFeatures: null,
      apiAccessEnabled: true,
    });
    expect(mods).toContain("partner-api");
    // partner-api NÃO vem do plano nem das deps: é override puro do superadmin.
    expect(mods).not.toContain("pdv");
  });

  it("sem apiAccessEnabled, partner-api NÃO entra", () => {
    const mods = allowedModulesForTenant({
      tenantSlug: "pdv-x",
      hasPlan: false,
      planFeatures: null,
    });
    expect(mods).not.toContain("partner-api");
  });

  it("override soma ao piso num tenant sem plano (grant explícito do superadmin)", () => {
    const mods = allowedModulesForTenant({
      tenantSlug: "pdv-x",
      hasPlan: false,
      planFeatures: null,
      apiAccessEnabled: true,
    });
    expect(mods).toContain("settings"); // piso sempre-on
    expect(mods).toContain("partner-api"); // + override
  });

  it("isPathAllowed bloqueia /settings/partner-api sem o módulo", () => {
    expect(isPathAllowed("/settings/partner-api", ["wallet"])).toBe(false);
    expect(isPathAllowed("/settings/partner-api", ["wallet", "partner-api"])).toBe(true);
  });
});
