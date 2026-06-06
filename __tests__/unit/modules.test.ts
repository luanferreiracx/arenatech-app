import { describe, it, expect } from "vitest";
import {
  resolveModuleForPath,
  modulesFromPlanFeatures,
  allowedModulesForTenant,
  isPathAllowed,
  MODULE_KEYS,
  DEFAULT_RELEASED_MODULES,
  TOTAL_ACCESS_TENANT_SLUG,
} from "@/lib/modules";

describe("resolveModuleForPath", () => {
  it("mapeia só a carteira para wallet; vendas avulsas e saques para depix-ops", () => {
    expect(resolveModuleForPath("/depix-wallet")).toBe("wallet");
    expect(resolveModuleForPath("/depix/withdrawals")).toBe("depix-ops");
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

  it("settings agora É gateado (modulo settings, fora do plano por enquanto)", () => {
    expect(resolveModuleForPath("/settings")).toBe("settings");
    expect(resolveModuleForPath("/settings/payment-methods")).toBe("settings");
    expect(resolveModuleForPath("/settings/installments")).toBe("settings");
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

describe("allowedModulesForTenant", () => {
  it("arena-tech tem acesso TOTAL", () => {
    const mods = allowedModulesForTenant({
      tenantSlug: TOTAL_ACCESS_TENANT_SLUG,
      planFeatures: { modules: ["wallet"] },
      hasPlan: true,
    });
    expect(mods).toEqual([...MODULE_KEYS]);
  });

  it("tenant sem plano cai no padrão (só wallet)", () => {
    expect(
      allowedModulesForTenant({ tenantSlug: "loja-x", planFeatures: null, hasPlan: false }),
    ).toEqual(DEFAULT_RELEASED_MODULES);
  });

  it("tenant com plano usa o que o plano libera", () => {
    expect(
      allowedModulesForTenant({
        tenantSlug: "loja-x",
        planFeatures: { modules: ["wallet", "pdv"] },
        hasPlan: true,
      }),
    ).toEqual(["wallet", "pdv"]);
  });
});

describe("isPathAllowed", () => {
  it("libera rota sem gating sempre", () => {
    expect(isPathAllowed("/painel", [])).toBe(true);
    expect(isPathAllowed("/select-tenant", [])).toBe(true);
  });

  it("bloqueia rota de módulo não liberado (inclusive settings)", () => {
    expect(isPathAllowed("/pdv", ["wallet"])).toBe(false);
    expect(isPathAllowed("/service-orders", ["wallet"])).toBe(false);
    expect(isPathAllowed("/settings", ["wallet"])).toBe(false);
  });

  it("libera rota de módulo liberado", () => {
    expect(isPathAllowed("/depix-wallet", ["wallet"])).toBe(true);
    expect(isPathAllowed("/pdv", ["wallet", "pdv"])).toBe(true);
  });
});
