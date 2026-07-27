/**
 * Auditoria 2026-07-25 — caps de campanha de fidelidade eram TOCTOU.
 *
 * `createAction` lia `campaign.totalRewardsGenerated` / `totalParticipants` num
 * snapshot, comparava com o limite e — bem depois — fazia
 * `update({ increment: 1 })` cego. Sob READ COMMITTED, N claims concorrentes
 * leem o mesmo contador, todos passam o gate e todos incrementam:
 *
 *   rewardLimit = 100, totalRewardsGenerated = 99
 *   → T1 e T2 leem 99, ambos passam "99 >= 100? não", ambos incrementam
 *   → 101 recompensas geradas (com N requests: 99+N)
 *
 * Cap de campanha burlável = custo de fidelidade acima do orçado.
 *
 * A correção repete a condição no `where` do update: o Postgres reavalia o
 * predicado depois do row lock, então o perdedor vê count 0 e aborta.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
vi.mock("@/server/auth", () => ({ auth: async () => null }));
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createCallerFactory } from "@/server/api/trpc";
import { appRouter } from "@/server/api/root";
import { withTenant } from "@/server/db";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const MARK = "reward-caps";
let tenantId: string, adminId: string, ctx: any;
let clienteA: string, clienteB: string;
const campanhaIds: string[] = [];

const caller = () => createCallerFactory(appRouter)(ctx);

beforeAll(async () => {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "arena-tech" } });
  const admin = await prisma.user.findFirstOrThrow({ where: { name: "Admin Arena" } });
  tenantId = tenant.id;
  adminId = admin.id;
  ctx = {
    session: {
      user: { id: adminId, isSuperAdmin: false },
      activeTenantId: tenantId,
      availableTenants: [{ id: tenantId, slug: "arena-tech", role: "admin", modules: ["customers"] }],
    },
    tenantId,
    withTenant: (fn: any) => withTenant(tenantId, fn),
  };
  clienteA = (await prisma.customer.create({ data: { tenantId, name: `${MARK}-A`, phone: "11911110001" } })).id;
  clienteB = (await prisma.customer.create({ data: { tenantId, name: `${MARK}-B`, phone: "11911110002" } })).id;
});

afterAll(async () => {
  await prisma.rewardAction.deleteMany({ where: { tenantId, customerId: { in: [clienteA, clienteB] } } });
  await prisma.rewardCampaign.deleteMany({ where: { id: { in: campanhaIds } } });
  await prisma.customer.deleteMany({ where: { id: { in: [clienteA, clienteB] } } });
  await prisma.$disconnect();
});

/** Campanha de desconto fixo com teto de `rewardLimit` recompensas. */
async function campanha(rewardLimit: number) {
  const c = await prisma.rewardCampaign.create({
    data: {
      tenantId,
      name: `${MARK}-${Date.now()}`,
      rewardType: "DISCOUNT_FIXED",
      value: 10,
      validityDays: 30,
      rewardLimit,
      active: true,
      createdById: adminId,
    },
  });
  campanhaIds.push(c.id);
  return c.id;
}

describe("caps de campanha de fidelidade", () => {
  it("dois claims SIMULTÂNEOS num teto de 1: só um gera recompensa", async () => {
    const campaignId = await campanha(1);

    const r = await Promise.allSettled([
      caller().reward.createAction({ customerId: clienteA, campaignId, rewardType: "DISCOUNT_FIXED" }),
      caller().reward.createAction({ customerId: clienteB, campaignId, rewardType: "DISCOUNT_FIXED" }),
    ]);

    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);

    const camp = await prisma.rewardCampaign.findUniqueOrThrow({ where: { id: campaignId } });
    expect(camp.totalRewardsGenerated).toBe(1); // nunca 2
    const acoes = await prisma.rewardAction.count({ where: { campaignId } });
    expect(acoes).toBe(1);
  });

  it("com teto disponível, o claim passa normalmente", async () => {
    const campaignId = await campanha(5);

    await expect(
      caller().reward.createAction({ customerId: clienteA, campaignId, rewardType: "DISCOUNT_FIXED" }),
    ).resolves.toBeDefined();

    const camp = await prisma.rewardCampaign.findUniqueOrThrow({ where: { id: campaignId } });
    expect(camp.totalRewardsGenerated).toBe(1);
  });

  it("teto esgotado recusa o próximo claim (caso sequencial)", async () => {
    const campaignId = await campanha(1);
    await caller().reward.createAction({ customerId: clienteA, campaignId, rewardType: "DISCOUNT_FIXED" });

    await expect(
      caller().reward.createAction({ customerId: clienteB, campaignId, rewardType: "DISCOUNT_FIXED" }),
    ).rejects.toThrow(/limite de recompensas/i);
  });
});
