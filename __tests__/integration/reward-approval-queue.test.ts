/**
 * E (fidelidade) fatia 2 — fila de aprovação: listActions traz o nome do cliente;
 * aprovar CASHBACK credita o saldo; aprovar 2x é bloqueado (CAS); rejeitar exige
 * motivo e não credita.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
vi.mock("@/server/auth", () => ({ auth: async () => null }));
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createCallerFactory } from "@/server/api/trpc";
import { appRouter } from "@/server/api/root";
import { withTenant } from "@/server/db";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const MARK = `rwq-${Date.now().toString(36)}`;
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
    data: { tenantId, name: `Cliente ${MARK}`, phone: "11944443333" },
  });
  customerId = customer.id;
});

afterAll(async () => {
  // RewardMovement liga por balanceId (não tem customerId).
  const balances = await prisma.rewardBalance.findMany({
    where: { tenantId, customerId },
    select: { id: true },
  });
  await prisma.rewardMovement.deleteMany({
    where: { balanceId: { in: balances.map((b) => b.id) } },
  });
  await prisma.rewardBalance.deleteMany({ where: { tenantId, customerId } });
  await prisma.rewardAction.deleteMany({ where: { id: { in: actionIds } } });
  await prisma.customer.deleteMany({ where: { id: customerId } });
  await prisma.$disconnect();
});

async function makePendingCashback(cents: number) {
  const a = await call(adminCtx).reward.createAction({
    customerId,
    rewardType: "CASHBACK",
    value: cents,
  });
  actionIds.push(a.id);
  return a.id;
}

describe("E fatia 2 — fila de aprovação de fidelidade", () => {
  it("listActions traz nome/telefone do cliente (a fila precisa identificar quem submeteu)", async () => {
    const id = await makePendingCashback(2000);
    const list = await call(adminCtx).reward.listActions({ status: "PENDING" });
    const found = list.data.find((a: any) => a.id === id);
    expect(found).toBeDefined();
    expect(found!.customerName).toBe(`Cliente ${MARK}`);
    expect(found!.customerPhone).toBe("11944443333");
  });

  it("aprovar CASHBACK credita o saldo; 2ª aprovação é bloqueada (CAS)", async () => {
    const id = await makePendingCashback(5000); // R$50

    await call(adminCtx).reward.approveAction({ actionId: id });

    const action = await prisma.rewardAction.findUniqueOrThrow({ where: { id } });
    expect(action.status).toBe("APPROVED");
    expect(action.validatedById).toBe(adminId);

    const balance = await prisma.rewardBalance.findFirst({ where: { tenantId, customerId } });
    expect(balance).not.toBeNull();
    expect(Number(balance!.availableBalance)).toBeGreaterThanOrEqual(50);

    // Reaprovar não pode duplicar o crédito.
    await expect(call(adminCtx).reward.approveAction({ actionId: id })).rejects.toThrow(
      /pendentes|já foi aprovada|processada/i,
    );
  });

  it("rejeitar grava o motivo e NÃO credita saldo", async () => {
    const before = await prisma.rewardBalance.findFirst({ where: { tenantId, customerId } });
    const beforeAvailable = before ? Number(before.availableBalance) : 0;

    const id = await makePendingCashback(9900);
    await call(adminCtx).reward.rejectAction({ actionId: id, reason: "publicação sem marcar a loja" });

    const action = await prisma.rewardAction.findUniqueOrThrow({ where: { id } });
    expect(action.status).toBe("REJECTED");
    expect(action.rejectionReason).toMatch(/sem marcar/i);

    const after = await prisma.rewardBalance.findFirst({ where: { tenantId, customerId } });
    expect(after ? Number(after.availableBalance) : 0).toBe(beforeAvailable);
  });
});
