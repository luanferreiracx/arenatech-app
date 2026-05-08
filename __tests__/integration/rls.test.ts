/**
 * RLS Integration Tests — validates multi-tenant isolation via PostgreSQL Row Level Security.
 *
 * These tests connect to the local Postgres (docker-compose, port 5432)
 * and exercise the withTenant / withAdmin helpers against real RLS policies.
 *
 * Scenarios:
 *   A. Query with tenant 1 returns only tenant 1 data
 *   B. Query with tenant 2 returns only tenant 2 data
 *   C. Insert with wrong tenant_id fails (WITH CHECK violation)
 *   D. Query as app_admin returns all data (BYPASSRLS)
 *   E. Query without tenant_id set returns empty (defense in depth)
 *   F. Update on another tenant's row affects 0 rows (USING)
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Direct PrismaClient for setup/teardown (no RLS wrappers)
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// IDs set during setup
let tenantA: { id: string };
let tenantB: { id: string };

beforeAll(async () => {
  // Create two test tenants
  tenantA = await prisma.tenant.upsert({
    where: { slug: "rls-test-a" },
    update: {},
    create: { slug: "rls-test-a", name: "RLS Test A", status: "ACTIVE" },
  });
  tenantB = await prisma.tenant.upsert({
    where: { slug: "rls-test-b" },
    update: {},
    create: { slug: "rls-test-b", name: "RLS Test B", status: "ACTIVE" },
  });

  // Clean up any leftover audit_logs from previous runs
  await prisma.auditLog.deleteMany({
    where: { tenantId: { in: [tenantA.id, tenantB.id] } },
  });

  // Insert test data — 2 logs per tenant
  await prisma.auditLog.createMany({
    data: [
      { tenantId: tenantA.id, action: "test.create", entity: "Widget", entityId: "a1" },
      { tenantId: tenantA.id, action: "test.update", entity: "Widget", entityId: "a2" },
      { tenantId: tenantB.id, action: "test.create", entity: "Gadget", entityId: "b1" },
      { tenantId: tenantB.id, action: "test.delete", entity: "Gadget", entityId: "b2" },
    ],
  });
});

afterAll(async () => {
  // Cleanup test data
  await prisma.auditLog.deleteMany({
    where: { tenantId: { in: [tenantA.id, tenantB.id] } },
  });
  await prisma.tenant.deleteMany({
    where: { slug: { in: ["rls-test-a", "rls-test-b"] } },
  });
  await prisma.$disconnect();
});

describe("RLS multi-tenant isolation", () => {
  it("A: query with tenant A returns only tenant A data", async () => {
    const logs = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL ROLE app_user`);
      await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant_id = '${tenantA.id}'`);
      return tx.auditLog.findMany({ orderBy: { createdAt: "asc" } });
    });

    expect(logs).toHaveLength(2);
    expect(logs.every((l) => l.tenantId === tenantA.id)).toBe(true);
    expect(logs[0]!.entity).toBe("Widget");
  });

  it("B: query with tenant B returns only tenant B data", async () => {
    const logs = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL ROLE app_user`);
      await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant_id = '${tenantB.id}'`);
      return tx.auditLog.findMany({ orderBy: { createdAt: "asc" } });
    });

    expect(logs).toHaveLength(2);
    expect(logs.every((l) => l.tenantId === tenantB.id)).toBe(true);
    expect(logs[0]!.entity).toBe("Gadget");
  });

  it("C: insert with wrong tenant_id fails (WITH CHECK violation)", async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        // Set tenant A context but try to insert with tenant B's ID
        await tx.$executeRawUnsafe(`SET LOCAL ROLE app_user`);
        await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant_id = '${tenantA.id}'`);
        return tx.auditLog.create({
          data: {
            tenantId: tenantB.id, // Wrong tenant!
            action: "test.sneaky",
            entity: "Hack",
          },
        });
      }),
    ).rejects.toThrow();
  });

  it("D: query as app_admin returns all data (BYPASSRLS)", async () => {
    const logs = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL ROLE app_admin`);
      return tx.auditLog.findMany({
        where: { tenantId: { in: [tenantA.id, tenantB.id] } },
        orderBy: { createdAt: "asc" },
      });
    });

    expect(logs).toHaveLength(4);
    const tenantIds = new Set(logs.map((l) => l.tenantId));
    expect(tenantIds.size).toBe(2);
  });

  it("E: query without tenant_id set returns empty (defense in depth)", async () => {
    const logs = await prisma.$transaction(async (tx) => {
      // SET ROLE app_user but NO tenant_id — current_tenant_id() returns NULL, matches no rows
      await tx.$executeRawUnsafe(`SET LOCAL ROLE app_user`);
      return tx.auditLog.findMany({
        where: { tenantId: { in: [tenantA.id, tenantB.id] } },
      });
    });

    expect(logs).toHaveLength(0);
  });

  it("F: update on another tenant's row affects 0 rows", async () => {
    // Tenant A tries to update tenant B's logs
    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL ROLE app_user`);
      await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant_id = '${tenantA.id}'`);
      return tx.auditLog.updateMany({
        where: { tenantId: tenantB.id },
        data: { action: "test.hacked" },
      });
    });

    expect(result.count).toBe(0);

    // Verify tenant B's data is untouched
    const bLogs = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL ROLE app_user`);
      await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant_id = '${tenantB.id}'`);
      return tx.auditLog.findMany();
    });

    expect(bLogs.every((l) => l.action !== "test.hacked")).toBe(true);
  });
});
