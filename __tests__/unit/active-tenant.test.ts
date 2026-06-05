import { describe, expect, it } from "vitest";
import { hasTenantAccess, resolveActiveTenant, type TenantSession } from "@/lib/auth/active-tenant";

const central = {
  id: "00000000-0000-0000-0000-000000000001",
  slug: "arena-tech",
  name: "Arena Tech",
  role: "admin",
  modules: ["wallet", "pdv"],
};

const jma = {
  id: "00000000-0000-0000-0000-000000000002",
  slug: "jma",
  name: "JMA",
  role: "admin",
  modules: ["wallet"],
};

function session(overrides: Partial<TenantSession> = {}): TenantSession {
  return {
    activeTenantId: central.id,
    availableTenants: [central],
    ...overrides,
  };
}

describe("active tenant resolution", () => {
  it("ignora cookie de tenant que nao pertence a sessao", () => {
    expect(resolveActiveTenant(session(), jma.id)).toEqual(central);
  });

  it("usa cookie valido quando pertence a sessao", () => {
    expect(
      resolveActiveTenant(
        session({ activeTenantId: central.id, availableTenants: [central, jma] }),
        jma.id,
      ),
    ).toEqual(jma);
  });

  it("nao concede acesso especial por superadmin fora da lista de tenants", () => {
    expect(hasTenantAccess(session({ availableTenants: [] }), jma.id)).toBe(false);
  });
});
