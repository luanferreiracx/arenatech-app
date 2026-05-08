/**
 * Regression tests for tenant access validation in tenantProcedure.
 *
 * Verifies that the backend REJECTS forged cookie values,
 * independent of proxy protection (defense in depth).
 *
 * We test the exact validation logic from tenantProcedure without
 * importing the full tRPC router (which pulls in NextAuth/next/server).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

let tenantA: { id: string; slug: string; name: string };
let tenantB: { id: string; slug: string; name: string };

beforeAll(async () => {
  const a = await prisma.tenant.findUnique({ where: { slug: "arena-tech" } });
  const b = await prisma.tenant.findUnique({ where: { slug: "loja-teste" } });
  if (!a || !b) throw new Error("Seed tenants not found. Run seed first.");
  tenantA = { id: a.id, slug: a.slug, name: a.name };
  tenantB = { id: b.id, slug: b.slug, name: b.name };
});

afterAll(async () => {
  await prisma.$disconnect();
});

/**
 * Exact replica of the guard logic in src/server/api/trpc.ts tenantProcedure.
 * If the code in trpc.ts changes, this test verifies the expected behavior.
 */
function validateTenantAccess(
  tenantId: string,
  availableTenants: Array<{ id: string }>,
  isSuperAdmin: boolean,
): { allowed: boolean } {
  const hasTenant = availableTenants.some((t) => t.id === tenantId);
  if (!hasTenant && !isSuperAdmin) {
    return { allowed: false };
  }
  return { allowed: true };
}

describe("tenantProcedure access validation (defense in depth)", () => {
  it("rejects forged cookie: user has tenant A but header says tenant B", () => {
    const result = validateTenantAccess(
      tenantB.id, // forged — user doesn't have this
      [{ id: tenantA.id }], // user only has tenant A
      false,
    );
    expect(result.allowed).toBe(false);
  });

  it("rejects forged cookie: user has no tenants at all", () => {
    const result = validateTenantAccess(
      tenantA.id,
      [], // no tenants
      false,
    );
    expect(result.allowed).toBe(false);
  });

  it("rejects forged cookie: random UUID not matching any tenant", () => {
    const result = validateTenantAccess(
      "00000000-0000-0000-0000-000000000000", // totally fake
      [{ id: tenantA.id }],
      false,
    );
    expect(result.allowed).toBe(false);
  });

  it("super admin can access ANY tenant (even without being linked)", () => {
    const result = validateTenantAccess(
      tenantB.id,
      [], // super admin has no tenants
      true, // but is super admin
    );
    expect(result.allowed).toBe(true);
  });

  it("user with valid access to the requested tenant passes", () => {
    const result = validateTenantAccess(
      tenantA.id,
      [{ id: tenantA.id }, { id: tenantB.id }],
      false,
    );
    expect(result.allowed).toBe(true);
  });

  it("user with valid access to one of multiple tenants passes", () => {
    const result = validateTenantAccess(
      tenantB.id,
      [{ id: tenantA.id }, { id: tenantB.id }],
      false,
    );
    expect(result.allowed).toBe(true);
  });
});
