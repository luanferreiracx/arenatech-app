/**
 * E (fidelidade) fatia 3 — saldo do cliente: getBalance devolve saldo+extrato em
 * CENTAVOS após um cashback aprovado; getAvailableRewards lista as aprovadas.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
vi.mock("@/server/auth", () => ({ auth: async () => null }));
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createCallerFactory } from "@/server/api/trpc";
import { appRouter } from "@/server/api/root";
import { withTenant } from "@/server/db";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const MARK = `rwb-${Date.now().toString(36)}`;
let tenantId: string, adminId: string, customerId: string, adminCtx: any;
const actionIds: string[] = [];
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
  const customer = await prisma.customer.create({
    data: { tenantId, name: `Cliente ${MARK}`, phone: "11933332222" },
  });
  customerId = customer.id;
});

afterAll(async () => {
  const balances = await prisma.rewardBalance.findMany({
    where: { tenantId, customerId }, select: { id: true },
  });
  await prisma.rewardMovement.deleteMany({ where: { balanceId: { in: balances.map((b) => b.id) } } });
  await prisma.rewardBalance.deleteMany({ where: { tenantId, customerId } });
  await prisma.rewardAction.deleteMany({ where: { id: { in: actionIds } } });
  await prisma.customer.deleteMany({ where: { id: customerId } });
  await prisma.$disconnect();
});

describe("E fatia 3 — saldo de fidelidade do cliente", () => {
  it("cliente sem fidelidade: saldo zero e sem movimentos (não quebra)", async () => {
    const balance = await call(adminCtx).reward.getBalance({ customerId });
    expect(balance.availableBalance).toBe(0);
    expect(balance.totalBalance).toBe(0);
    expect(balance.movements).toEqual([]);
  });

  it("após aprovar cashback: saldo em CENTAVOS + extrato + recompensa disponível", async () => {
    const action = await call(adminCtx).reward.createAction({
      customerId, rewardType: "CASHBACK", value: 7500, // R$75
    });
    actionIds.push(action.id);
    await call(adminCtx).reward.approveAction({ actionId: action.id });

    const balance = await call(adminCtx).reward.getBalance({ customerId });
    // Serializado em centavos (o painel usa <Money cents>).
    expect(balance.availableBalance).toBe(7500);
    expect(balance.movements.length).toBeGreaterThanOrEqual(1);
    const credit = balance.movements.find((m: any) => m.type === "credit");
    expect(credit).toBeDefined();
    expect(credit!.amount).toBe(7500);

    // A recompensa aprovada aparece como disponível (com o nome da campanha nulo aqui).
    const rewards = await call(adminCtx).reward.getAvailableRewards({ customerId });
    expect(rewards.some((r: any) => r.id === action.id)).toBe(true);
  });
});
