import { describe, it, expect } from "vitest";
import {
  resolveModuleForPath,
  modulesFromPlanFeatures,
  allowedModulesForTenant,
  isPathAllowed,
  withModuleDependencies,
  modulesRequiredBySelection,
  MODULE_KEYS,
  DEFAULT_RELEASED_MODULES,
  TOTAL_ACCESS_TENANT_SLUG,
  ALWAYS_ON_MODULES,
  PLAN_SELECTABLE_MODULES,
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

  it("cai no padrão quando sem modules", () => {
    expect(modulesFromPlanFeatures(null)).toEqual(DEFAULT_RELEASED_MODULES);
    expect(modulesFromPlanFeatures({})).toEqual(DEFAULT_RELEASED_MODULES);
  });

  it("cai no padrão quando modules vem vazio ou sem valores validos", () => {
    expect(modulesFromPlanFeatures({ modules: [] })).toEqual(DEFAULT_RELEASED_MODULES);
    expect(modulesFromPlanFeatures({ modules: ["inexistente", 42] })).toEqual(DEFAULT_RELEASED_MODULES);
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
});

describe("allowedModulesForTenant", () => {
  // settings é sempre-on; pdv auto-inclui cashier+financial; service-orders/fiscal/
  // commissions auto-incluem pdv (e por transitividade cashier+financial).
  it("arena-tech tem acesso TOTAL", () => {
    const mods = allowedModulesForTenant({
      tenantSlug: TOTAL_ACCESS_TENANT_SLUG,
      planFeatures: { modules: ["wallet"] },
      hasPlan: true,
    });
    expect(asSet(mods)).toEqual(asSet([...MODULE_KEYS]));
  });

  it("tenant sem plano cai no padrão (wallet+depix-ops) + settings sempre-on", () => {
    expect(
      asSet(allowedModulesForTenant({ tenantSlug: "loja-x", planFeatures: null, hasPlan: false })),
    ).toEqual(asSet([...DEFAULT_RELEASED_MODULES, "settings"]));
  });

  it("tenant com plano usa o que o plano libera + pré-requisitos + settings", () => {
    expect(
      asSet(allowedModulesForTenant({
        tenantSlug: "loja-x",
        planFeatures: { modules: ["wallet", "pdv"] },
        hasPlan: true,
      })),
    ).toEqual(asSet(["wallet", "pdv", "cashier", "financial", "stock", "customers", "settings"]));
  });

  // ── NO-KYC: piso wallet SEM plano; plano ativo vence o piso (revisão ADR 0050) ──
  it("NO-KYC COM plano ativo passa a ter os módulos do plano (+ deps + settings)", () => {
    expect(
      asSet(allowedModulesForTenant({
        tenantSlug: "pdv-7f3a9c",
        planFeatures: { modules: ["wallet", "pdv", "stock", "financial"] },
        hasPlan: true,
        isNoKyc: true,
      })),
    ).toEqual(asSet(["wallet", "pdv", "stock", "financial", "cashier", "customers", "settings"]));
  });

  it("NO-KYC sem plano fica no piso (wallet+depix-ops) + settings", () => {
    expect(
      asSet(allowedModulesForTenant({ tenantSlug: "pdv-x", planFeatures: null, hasPlan: false, isNoKyc: true })),
    ).toEqual(asSet(["wallet", "depix-ops", "settings"]));
  });

  it("NO-KYC com plano parcial libera o plano + pré-requisitos (service-orders→pdv→...)", () => {
    expect(
      asSet(allowedModulesForTenant({
        tenantSlug: "pdv-x",
        planFeatures: { modules: ["wallet", "service-orders", "customers"] },
        hasPlan: true,
        isNoKyc: true,
      })),
    ).toEqual(asSet(["wallet", "service-orders", "customers", "pdv", "cashier", "financial", "stock", "settings"]));
  });

  it("isNoKyc não afeta o tenant de acesso total (arena-tech)", () => {
    const mods = allowedModulesForTenant({
      tenantSlug: "arena-tech",
      planFeatures: null,
      hasPlan: false,
      isNoKyc: true,
    });
    expect(mods.length).toBeGreaterThan(1);
    expect(mods).toContain("pdv");
  });

  it("KYC (isNoKyc=false) segue respeitando o plano (+ deps + settings)", () => {
    expect(
      asSet(allowedModulesForTenant({
        tenantSlug: "loja-kyc",
        planFeatures: { modules: ["wallet", "pdv"] },
        hasPlan: true,
        isNoKyc: false,
      })),
    ).toEqual(asSet(["wallet", "pdv", "cashier", "financial", "stock", "customers", "settings"]));
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

  it("override vale também pra NO-KYC (grant explícito do superadmin)", () => {
    const mods = allowedModulesForTenant({
      tenantSlug: "pdv-x",
      hasPlan: false,
      planFeatures: null,
      isNoKyc: true,
      apiAccessEnabled: true,
    });
    expect(mods).toContain("wallet"); // piso NO-KYC
    expect(mods).toContain("partner-api"); // + override
  });

  it("isPathAllowed bloqueia /settings/partner-api sem o módulo", () => {
    expect(isPathAllowed("/settings/partner-api", ["wallet"])).toBe(false);
    expect(isPathAllowed("/settings/partner-api", ["wallet", "partner-api"])).toBe(true);
  });
});
