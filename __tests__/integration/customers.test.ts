/**
 * Integration tests for Customer RLS — validates multi-tenant isolation.
 *
 * Tests:
 *   A. Create customer with tenantA — only visible to tenantA
 *   B. Create customer with tenantB — only visible to tenantB
 *   C. Soft delete — deletedAt set, not returned in list (with default filter)
 *   D. Restore — deletedAt cleared, back in list
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { withTenant, withAdmin } from "@/server/db";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const directPrisma = new PrismaClient({ adapter });

let tenantA: { id: string };
let tenantB: { id: string };
let customerAId: string;
let customerBId: string;

beforeAll(async () => {
  tenantA = await directPrisma.tenant.upsert({
    where: { slug: "cust-test-a" },
    update: {},
    create: { slug: "cust-test-a", name: "Customer Test A", status: "ACTIVE" },
  });
  tenantB = await directPrisma.tenant.upsert({
    where: { slug: "cust-test-b" },
    update: {},
    create: { slug: "cust-test-b", name: "Customer Test B", status: "ACTIVE" },
  });

  // Clean up leftover test data
  await withAdmin(async (tx) => {
    await tx.customer.deleteMany({
      where: {
        tenantId: { in: [tenantA.id, tenantB.id] },
      },
    });
  });
});

afterAll(async () => {
  // Clean up
  await withAdmin(async (tx) => {
    await tx.customer.deleteMany({
      where: {
        tenantId: { in: [tenantA.id, tenantB.id] },
      },
    });
  });
  await directPrisma.$disconnect();
});

describe("Customer RLS", () => {
  it("A. creates customer in tenantA", async () => {
    const customer = await withTenant(tenantA.id, async (tx) => {
      return tx.customer.create({
        data: {
          tenantId: tenantA.id,
          type: "PF",
          name: "Cliente A",
          phone: "86999990000",
        },
      });
    });
    customerAId = customer.id;
    expect(customer.name).toBe("Cliente A");
    expect(customer.tenantId).toBe(tenantA.id);
  });

  it("B. creates customer in tenantB", async () => {
    const customer = await withTenant(tenantB.id, async (tx) => {
      return tx.customer.create({
        data: {
          tenantId: tenantB.id,
          type: "PF",
          name: "Cliente B",
          phone: "86999991111",
        },
      });
    });
    customerBId = customer.id;
    expect(customer.name).toBe("Cliente B");
    expect(customer.tenantId).toBe(tenantB.id);
  });

  it("A. query with tenantA sees only tenantA customer", async () => {
    const customers = await withTenant(tenantA.id, async (tx) => {
      return tx.customer.findMany({ where: { tenantId: tenantA.id } });
    });
    const names = customers.map((c) => c.name);
    expect(names).toContain("Cliente A");
    expect(names).not.toContain("Cliente B");
  });

  it("B. query with tenantB sees only tenantB customer", async () => {
    const customers = await withTenant(tenantB.id, async (tx) => {
      return tx.customer.findMany({ where: { tenantId: tenantB.id } });
    });
    const names = customers.map((c) => c.name);
    expect(names).toContain("Cliente B");
    expect(names).not.toContain("Cliente A");
  });

  it("C. soft delete — sets deletedAt", async () => {
    await withTenant(tenantA.id, async (tx) => {
      return tx.customer.update({
        where: { id: customerAId },
        data: { deletedAt: new Date() },
      });
    });

    const customer = await withTenant(tenantA.id, async (tx) => {
      return tx.customer.findFirst({ where: { id: customerAId } });
    });
    expect(customer?.deletedAt).not.toBeNull();
  });

  it("C. soft delete — not returned in list with deletedAt: null filter", async () => {
    const customers = await withTenant(tenantA.id, async (tx) => {
      return tx.customer.findMany({
        where: { tenantId: tenantA.id, deletedAt: null },
      });
    });
    const ids = customers.map((c) => c.id);
    expect(ids).not.toContain(customerAId);
  });

  it("D. restore — clears deletedAt", async () => {
    await withTenant(tenantA.id, async (tx) => {
      return tx.customer.update({
        where: { id: customerAId },
        data: { deletedAt: null },
      });
    });

    const customer = await withTenant(tenantA.id, async (tx) => {
      return tx.customer.findFirst({ where: { id: customerAId } });
    });
    expect(customer?.deletedAt).toBeNull();
  });

  it("D. restore — appears in list again", async () => {
    const customers = await withTenant(tenantA.id, async (tx) => {
      return tx.customer.findMany({
        where: { tenantId: tenantA.id, deletedAt: null },
      });
    });
    const ids = customers.map((c) => c.id);
    expect(ids).toContain(customerAId);
  });

  it("admin — sees both tenants customers", async () => {
    const customers = await withAdmin(async (tx) => {
      return tx.customer.findMany({
        where: { tenantId: { in: [tenantA.id, tenantB.id] } },
      });
    });
    const names = customers.map((c) => c.name);
    expect(names).toContain("Cliente A");
    expect(names).toContain("Cliente B");
  });
});
