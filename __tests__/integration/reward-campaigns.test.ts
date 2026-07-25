/**
 * E (fidelidade) — CRUD de campanhas de reward. Trava o updateCampaign estendido
 * (value/percentage/rewardType/maxCap/publicationType passam a persistir).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
vi.mock("@/server/auth", () => ({ auth: async () => null }));
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createCallerFactory } from "@/server/api/trpc";
import { appRouter } from "@/server/api/root";
import { withTenant } from "@/server/db";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const MARK = `reward-${Date.now().toString(36)}`;
let tenantId: string, adminId: string, adminCtx: any;
const ids: string[] = [];
const call = (c: any) => createCallerFactory(appRouter)(c);

beforeAll(async () => {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "arena-tech" } });
  const admin = await prisma.user.findFirstOrThrow({ where: { name: "Admin Arena" } });
  tenantId = tenant.id;
  adminId = admin.id;
  adminCtx = {
    session: { user: { id: adminId, isSuperAdmin: false }, activeTenantId: tenantId, availableTenants: [{ id: tenantId, slug: "arena-tech", role: "admin" }] },
    tenantId,
    withTenant: (fn: any) => withTenant(tenantId, fn),
  };
});

afterAll(async () => {
  await prisma.rewardCampaign.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});

describe("E — campanhas de fidelidade", () => {
  it("cria, lista, edita (value+tipo) e alterna", async () => {
    const created = await call(adminCtx).reward.createCampaign({
      name: `${MARK}-cashback`,
      publicationType: "story",
      rewardType: "CASHBACK",
      value: 5000, // R$50 em cashback
      validityDays: 30,
    });
    ids.push(created.id);

    const list = await call(adminCtx).reward.listCampaigns({});
    const found = list.data.find((c: any) => c.id === created.id);
    expect(found).toBeDefined();
    expect(found!.rewardType).toBe("CASHBACK");
    expect(found!.value).toBe(5000); // centavos

    // Edita valor e tipo (o fix do updateCampaign).
    await call(adminCtx).reward.updateCampaign({
      id: created.id,
      rewardType: "DISCOUNT_PERCENTAGE",
      percentage: 10,
      maxCap: 3000,
    });
    const c = await prisma.rewardCampaign.findUniqueOrThrow({ where: { id: created.id } });
    expect(c.rewardType).toBe("DISCOUNT_PERCENTAGE");
    expect(Number(c.percentage)).toBe(10);
    expect(Number(c.maxCap)).toBe(30); // R$30

    // Toggle desativa.
    const toggled = await call(adminCtx).reward.toggleCampaign({ id: created.id });
    expect(toggled.active).toBe(false);
  });
});
