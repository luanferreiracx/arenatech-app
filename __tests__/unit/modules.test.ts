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

  it("settings agora É gateado (modulo settings, fora do plano por enquanto)", () => {
    expect(resolveModuleForPath("/settings")).toBe("settings");
    expect(resolveModuleForPath("/settings/payment-methods")).toBe("settings");
    expect(resolveModuleForPath("/settings/installments")).toBe("settings");
  });

  it("EXCETO /settings/security: nunca gateado (2FA/senha p/ qualquer tenant)", () => {
    // Tenants wallet/NO-KYC precisam habilitar 2FA pra sacar — a pagina nao pode
    // ser bloqueada por modulo, senao ficam num beco.
    expect(resolveModuleForPath("/settings/security")).toBeNull();
    expect(resolveModuleForPath("/settings/security/anything")).toBeNull();
    // wallet-only (sem modulo settings) PODE acessar /settings/security:
    expect(isPathAllowed("/settings/security", ["wallet", "depix-ops"])).toBe(true);
    // mas continua sem as demais paginas de settings:
    expect(isPathAllowed("/settings/general", ["wallet", "depix-ops"])).toBe(false);
    expect(isPathAllowed("/settings/payment-methods", ["wallet", "depix-ops"])).toBe(false);
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

  // ── NO-KYC: piso wallet SEM plano; plano ativo vence o piso (revisão ADR 0050) ──
  it("NO-KYC COM plano ativo passa a ter os módulos do plano (ativar = liberar)", () => {
    expect(
      allowedModulesForTenant({
        tenantSlug: "pdv-7f3a9c",
        planFeatures: { modules: ["wallet", "pdv", "stock", "financial"] },
        hasPlan: true,
        isNoKyc: true,
      }),
    ).toEqual(["wallet", "pdv", "stock", "financial"]);
  });

  it("NO-KYC sem plano fica no piso (wallet+depix-ops)", () => {
    expect(
      allowedModulesForTenant({ tenantSlug: "pdv-x", planFeatures: null, hasPlan: false, isNoKyc: true }),
    ).toEqual(["wallet", "depix-ops"]);
  });

  it("NO-KYC com plano parcial libera exatamente o plano (não força wallet-only nem tudo)", () => {
    expect(
      allowedModulesForTenant({
        tenantSlug: "pdv-x",
        planFeatures: { modules: ["wallet", "service-orders", "customers"] },
        hasPlan: true,
        isNoKyc: true,
      }),
    ).toEqual(["wallet", "service-orders", "customers"]);
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

  it("KYC (isNoKyc=false) segue respeitando o plano", () => {
    expect(
      allowedModulesForTenant({
        tenantSlug: "loja-kyc",
        planFeatures: { modules: ["wallet", "pdv"] },
        hasPlan: true,
        isNoKyc: false,
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

describe("partner-api — módulo com override por-tenant (ADR 0057)", () => {
  it("/settings/partner-api resolve pro módulo partner-api (não settings)", () => {
    expect(resolveModuleForPath("/settings/partner-api")).toBe("partner-api");
    expect(resolveModuleForPath("/settings/partner-api/x")).toBe("partner-api");
    // O /settings genérico segue em settings.
    expect(resolveModuleForPath("/settings/general")).toBe("settings");
  });

  it("apiAccessEnabled libera partner-api MESMO sem o módulo settings (tenant wallet-only)", () => {
    const mods = allowedModulesForTenant({
      tenantSlug: "pdv-x",
      hasPlan: false, // cai no default (wallet, depix-ops) — sem settings
      planFeatures: null,
      apiAccessEnabled: true,
    });
    expect(mods).toContain("partner-api");
    expect(mods).not.toContain("settings");
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
    expect(mods).toContain("wallet"); // teto NO-KYC
    expect(mods).toContain("partner-api"); // + override
  });

  it("isPathAllowed bloqueia /settings/partner-api sem o módulo", () => {
    expect(isPathAllowed("/settings/partner-api", ["wallet"])).toBe(false);
    expect(isPathAllowed("/settings/partner-api", ["wallet", "partner-api"])).toBe(true);
  });
});
