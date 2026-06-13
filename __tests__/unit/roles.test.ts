import { describe, it, expect } from "vitest";
import { normalizeTenantRole, getTenantRole, isTenantAdmin } from "@/lib/auth/roles";

const T = "00000000-0000-0000-0000-000000000001";

function session(opts: { isSuperAdmin?: boolean; role?: string }) {
  return {
    user: { isSuperAdmin: opts.isSuperAdmin ?? false },
    availableTenants: opts.role !== undefined ? [{ id: T, role: opts.role }] : [],
  };
}

describe("normalizeTenantRole", () => {
  it("admin e legados owner/manager → admin", () => {
    for (const r of ["admin", "owner", "manager", "OWNER", "Admin", "MANAGER"]) {
      expect(normalizeTenantRole(r)).toBe("admin");
    }
  });
  it("operator, technician, cashier e desconhecidos → operator", () => {
    for (const r of ["operator", "technician", "cashier", "", "qualquer", null, undefined]) {
      expect(normalizeTenantRole(r)).toBe("operator");
    }
  });
});

describe("getTenantRole", () => {
  it("retorna o papel normalizado do tenant ativo", () => {
    expect(getTenantRole(session({ role: "owner" }), T)).toBe("admin");
    expect(getTenantRole(session({ role: "technician" }), T)).toBe("operator");
  });
  it("operator quando o tenant não está na lista", () => {
    expect(getTenantRole(session({}), T)).toBe("operator");
  });
});

describe("isTenantAdmin", () => {
  it("superadmin é admin em qualquer tenant (mesmo sem vínculo)", () => {
    expect(isTenantAdmin(session({ isSuperAdmin: true }), T)).toBe(true);
  });
  it("admin do tenant (e legados owner/manager) → true", () => {
    expect(isTenantAdmin(session({ role: "admin" }), T)).toBe(true);
    expect(isTenantAdmin(session({ role: "owner" }), T)).toBe(true);
    expect(isTenantAdmin(session({ role: "manager" }), T)).toBe(true);
  });
  it("operator / technician / cashier → false", () => {
    expect(isTenantAdmin(session({ role: "operator" }), T)).toBe(false);
    expect(isTenantAdmin(session({ role: "technician" }), T)).toBe(false);
    expect(isTenantAdmin(session({ role: "cashier" }), T)).toBe(false);
  });
});
