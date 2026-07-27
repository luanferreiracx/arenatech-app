/**
 * Auditoria 2026-07-25 — mutations de fidelidade que valem DINHEIRO sem gate.
 *
 * `approveAction` e `cancelAction` já exigiam `isTenantAdmin`. Ficaram de fora:
 * `createCampaign`, `updateCampaign`, `toggleCampaign` e `rejectAction`.
 *
 * O valor da campanha vira desconto REAL no PDV (`applyRewardDiscount` lê
 * `campaign.value`/`percentage` no `createAction`). Um operador chamando
 * `updateCampaign({ value: 50000, percentage: 100 })` transformava a campanha
 * em 100% de desconto para todo claim seguinte — sem trilha.
 *
 * `rejectAction` é a contraparte de `approveAction`: aprovar exigia admin,
 * rejeitar a submissão de um cliente não exigia nada.
 *
 * `createAction` CONTINUA sem gate de propósito: cria a ação como PENDING, e o
 * crédito só acontece no `approveAction` (admin). É segregação de função —
 * operador registra a submissão, admin aprova e credita.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
vi.mock("@/server/auth", () => ({ auth: async () => null }));
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createCallerFactory } from "@/server/api/trpc";
import { appRouter } from "@/server/api/root";
import { withTenant } from "@/server/db";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const MARK = "reward-authz";
let tenantId: string, adminId: string, operatorId: string, customerId: string;
const campanhaIds: string[] = [];

function mkCtx(userId: string, role: "admin" | "operator") {
  return {
    session: {
      user: { id: userId, isSuperAdmin: false },
      activeTenantId: tenantId,
      availableTenants: [{ id: tenantId, slug: "arena-tech", role, modules: ["customers"] }],
    },
    tenantId,
    withTenant: (fn: any) => withTenant(tenantId, fn),
  } as any;
}
const call = (ctx: any) => createCallerFactory(appRouter)(ctx);

beforeAll(async () => {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "arena-tech" } });
  const admin = await prisma.user.findFirstOrThrow({ where: { name: "Admin Arena" } });
  const operator = await prisma.user.findFirstOrThrow({ where: { name: "Operador Arena" } });
  tenantId = tenant.id;
  adminId = admin.id;
  operatorId = operator.id;
  customerId = (await prisma.customer.create({
    data: { tenantId, name: `${MARK}-c`, phone: "11922223333" },
  })).id;
});

afterAll(async () => {
  await prisma.rewardAction.deleteMany({ where: { tenantId, customerId } });
  await prisma.rewardCampaign.deleteMany({ where: { id: { in: campanhaIds } } });
  await prisma.customer.deleteMany({ where: { id: customerId } });
  await prisma.$disconnect();
});

async function campanha() {
  const c = await prisma.rewardCampaign.create({
    data: {
      tenantId,
      name: `${MARK}-${Date.now()}`,
      rewardType: "DISCOUNT_FIXED",
      value: 10,
      validityDays: 30,
      active: true,
      createdById: adminId,
    },
  });
  campanhaIds.push(c.id);
  return c.id;
}

describe("fidelidade — quem define o valor da recompensa precisa ser admin", () => {
  it("operador NÃO cria campanha", async () => {
    await expect(
      call(mkCtx(operatorId, "operator")).reward.createCampaign({
        name: `${MARK}-op`,
        rewardType: "DISCOUNT_FIXED",
        value: 5000,
        validityDays: 30,
      }),
    ).rejects.toThrow(/permiss/i);
  });

  it("operador NÃO altera o valor da campanha (viraria desconto real no PDV)", async () => {
    const id = await campanha();

    await expect(
      call(mkCtx(operatorId, "operator")).reward.updateCampaign({ id, value: 50000 }),
    ).rejects.toThrow(/permiss/i);

    const c = await prisma.rewardCampaign.findUniqueOrThrow({ where: { id } });
    expect(Number(c.value)).toBe(10); // inalterado
  });

  it("operador NÃO liga/desliga campanha", async () => {
    const id = await campanha();
    await expect(
      call(mkCtx(operatorId, "operator")).reward.toggleCampaign({ id }),
    ).rejects.toThrow(/permiss/i);
  });

  it("operador NÃO rejeita submissão (contraparte de approveAction, que é admin)", async () => {
    const id = await campanha();
    const acao = await call(mkCtx(operatorId, "operator")).reward.createAction({
      customerId,
      campaignId: id,
      rewardType: "DISCOUNT_FIXED",
    });

    await expect(
      call(mkCtx(operatorId, "operator")).reward.rejectAction({
        actionId: acao.id,
        reason: "teste",
      }),
    ).rejects.toThrow(/permiss/i);
  });

  it("admin faz tudo normalmente", async () => {
    const id = await campanha();
    await expect(
      call(mkCtx(adminId, "admin")).reward.updateCampaign({ id, value: 2000 }),
    ).resolves.toBeDefined();

    const c = await prisma.rewardCampaign.findUniqueOrThrow({ where: { id } });
    expect(Number(c.value)).toBe(20);
  });

  it("operador AINDA registra a submissão (segregação: cria PENDING, admin credita)", async () => {
    const id = await campanha();
    const acao = await call(mkCtx(operatorId, "operator")).reward.createAction({
      customerId,
      campaignId: id,
      rewardType: "DISCOUNT_FIXED",
    });
    const salva = await prisma.rewardAction.findUniqueOrThrow({ where: { id: acao.id } });
    expect(salva.status).toBe("PENDING"); // nada creditado ainda
  });
});
