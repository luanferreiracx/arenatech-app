import { describe, it, expect } from "vitest";
import { can, type Capability } from "@/lib/auth/capabilities";

const T = "00000000-0000-0000-0000-000000000001";

function session(opts: { isSuperAdmin?: boolean; role?: string }) {
  return {
    user: { isSuperAdmin: opts.isSuperAdmin ?? false },
    availableTenants: opts.role !== undefined ? [{ id: T, role: opts.role }] : [],
  };
}

const OPERATOR_CAPS: Capability[] = [
  "moveStock",
  "manageSuppliers",
  "registerPurchase",
  "importCatalogCsv",
];
const ADMIN_CAPS: Capability[] = [
  "manageCatalog",
  "disposeStock",
  "deleteSupplier",
  "cancelPurchase",
  "changePurchaseDate",
];

describe("can — operador (funcionário comum)", () => {
  const operator = session({ role: "operator" });

  it("pode as capacidades do dia a dia", () => {
    for (const cap of OPERATOR_CAPS) {
      expect(can(operator, T, cap)).toBe(true);
    }
  });

  it("NÃO pode as capacidades de admin", () => {
    for (const cap of ADMIN_CAPS) {
      expect(can(operator, T, cap)).toBe(false);
    }
  });
});

describe("can — admin do tenant", () => {
  const admin = session({ role: "admin" });

  it("pode tudo (operador + admin)", () => {
    for (const cap of [...OPERATOR_CAPS, ...ADMIN_CAPS]) {
      expect(can(admin, T, cap)).toBe(true);
    }
  });
});

describe("can — superadmin", () => {
  it("pode tudo em qualquer tenant, mesmo sem vínculo", () => {
    const superAdmin = session({ isSuperAdmin: true });
    for (const cap of [...OPERATOR_CAPS, ...ADMIN_CAPS]) {
      expect(can(superAdmin, T, cap)).toBe(true);
    }
  });
});

describe("can — papéis legados normalizados", () => {
  it("owner/manager contam como admin", () => {
    for (const role of ["owner", "manager"]) {
      expect(can(session({ role }), T, "manageCatalog")).toBe(true);
    }
  });

  it("technician/cashier contam como operador (sem capacidades de admin)", () => {
    for (const role of ["technician", "cashier"]) {
      expect(can(session({ role }), T, "manageCatalog")).toBe(false);
      expect(can(session({ role }), T, "moveStock")).toBe(true);
    }
  });
});
