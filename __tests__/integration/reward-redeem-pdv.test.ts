/**
 * E (fidelidade) fatia 4 — resgate no PDV.
 *
 * Comportamentos (dinheiro — cada um vale um teste):
 *  1. Aplicar recompensa de desconto FIXO abate o total da venda e consome a
 *     recompensa (APPROVED→USED, vinculada à venda).
 *  2. Resgatar a MESMA recompensa 2x é bloqueado (CAS) — não desconta em dobro.
 *  3. Estornar a venda DEVOLVE a recompensa (USED→APPROVED) para o cliente usar
 *     de novo.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
vi.mock("@/server/auth", () => ({ auth: async () => null }));
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createCallerFactory } from "@/server/api/trpc";
import { appRouter } from "@/server/api/root";
import { withTenant } from "@/server/db";
import { openTestCashSession, closeTestCashSessions } from "../helpers/cash-session";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const MARK = `rwpdv-${Date.now().toString(36)}`;
let tenantId: string, adminId: string, customerId: string, productId: string, ctx: any;
const saleIds: string[] = [];
const actionIds: string[] = [];
const call = (c: any) => createCallerFactory(appRouter)(c);

beforeAll(async () => {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "arena-tech" } });
  const admin = await prisma.user.findFirstOrThrow({ where: { name: "Admin Arena" } });
  tenantId = tenant.id;
  adminId = admin.id;
  ctx = {
    session: { user: { id: adminId, isSuperAdmin: false }, activeTenantId: tenantId, availableTenants: [{ id: tenantId, slug: "arena-tech", role: "admin" }] },
    tenantId,
    withTenant: (fn: any) => withTenant(tenantId, fn),
  };
  customerId = (await prisma.customer.create({
    data: { tenantId, name: `Cliente ${MARK}`, phone: "11922221111" },
  })).id;
  productId = (await prisma.product.create({
    data: { tenantId, name: `${MARK}-produto`, salePrice: 100, costPrice: 50, currentStock: 100, active: true },
  })).id;
  await closeTestCashSessions(prisma, { tenantId, userId: adminId });
  await openTestCashSession(prisma, { tenantId, userId: adminId, initialBalance: 0 });
});

afterAll(async () => {
  for (const sid of saleIds) {
    await prisma.cardReceivable.deleteMany({ where: { saleId: sid } });
    await prisma.installment.deleteMany({ where: { transaction: { saleId: sid } } });
    await prisma.financialTransaction.deleteMany({ where: { saleId: sid } });
    await prisma.cashMovement.deleteMany({ where: { referenceId: sid } });
    await prisma.stockMovement.deleteMany({ where: { referenceId: sid } });
    await prisma.saleAudit.deleteMany({ where: { saleId: sid } });
    await prisma.saleItem.deleteMany({ where: { saleId: sid } });
    await prisma.sale.deleteMany({ where: { id: sid } });
  }
  const balances = await prisma.rewardBalance.findMany({ where: { tenantId, customerId }, select: { id: true } });
  await prisma.rewardMovement.deleteMany({ where: { balanceId: { in: balances.map((b) => b.id) } } });
  await prisma.rewardBalance.deleteMany({ where: { tenantId, customerId } });
  await prisma.rewardAction.deleteMany({ where: { id: { in: actionIds } } });
  const open = await prisma.cashSession.findMany({ where: { userId: adminId, closedAt: null }, select: { id: true } });
  for (const s of open) await prisma.cashMovement.deleteMany({ where: { cashSessionId: s.id } });
  await closeTestCashSessions(prisma, { tenantId, userId: adminId });
  await prisma.product.deleteMany({ where: { id: productId } });
  await prisma.customer.deleteMany({ where: { id: customerId } });
  await prisma.$disconnect();
});

/** Recompensa APROVADA de desconto fixo (R$ `cents`/100) pronta para resgate. */
async function makeApprovedFixedDiscount(cents: number) {
  const action = await call(ctx).reward.createAction({
    customerId, rewardType: "DISCOUNT_FIXED", value: cents,
  });
  actionIds.push(action.id);
  await call(ctx).reward.approveAction({ actionId: action.id });
  return action.id;
}

/** Venda DRAFT de R$100 com o cliente vinculado. */
async function makeDraftWithCustomer() {
  const c = call(ctx);
  const draft = await c.sale.createDraft();
  saleIds.push(draft.id);
  await c.sale.addItem({ saleId: draft.id, productId, quantity: 1, unitPrice: 10000 });
  await c.sale.setCustomer({ saleId: draft.id, customerId });
  return draft.id;
}

describe("E fatia 4 — resgate de fidelidade no PDV", () => {
  it("aplica recompensa de desconto fixo: abate o total e consome a recompensa", async () => {
    const actionId = await makeApprovedFixedDiscount(2000); // R$20
    const saleId = await makeDraftWithCustomer(); // R$100

    const result = await call(ctx).sale.applyRewardDiscount({ saleId, actionId });

    expect(result.discountCents).toBe(2000);

    const sale = await prisma.sale.findUniqueOrThrow({ where: { id: saleId } });
    expect(Number(sale.discountAmount)).toBe(20); // R$20
    expect(Number(sale.totalAmount)).toBe(80); // R$100 - R$20

    // Recompensa consumida e vinculada à venda.
    const action = await prisma.rewardAction.findUniqueOrThrow({ where: { id: actionId } });
    expect(action.status).toBe("USED");
    expect(action.usedInSaleId).toBe(saleId);
  });

  it("resgatar a MESMA recompensa 2x é bloqueado (não desconta em dobro)", async () => {
    const actionId = await makeApprovedFixedDiscount(3000); // R$30
    const saleA = await makeDraftWithCustomer();

    await call(ctx).sale.applyRewardDiscount({ saleId: saleA, actionId });

    // Segunda venda tentando usar a MESMA recompensa. `createDraft` REAPROVEITA o
    // rascunho aberto do vendedor — abandona o anterior para nascer um novo.
    await call(ctx).sale.abandonDraft();
    const saleB = await makeDraftWithCustomer();
    expect(saleB).not.toBe(saleA);
    await expect(
      call(ctx).sale.applyRewardDiscount({ saleId: saleB, actionId }),
    ).rejects.toThrow(/nao disponivel|já utilizada|ja utilizada/i);

    // A segunda venda continua sem desconto.
    const b = await prisma.sale.findUniqueOrThrow({ where: { id: saleB } });
    expect(Number(b.discountAmount)).toBe(0);
    expect(Number(b.totalAmount)).toBe(100);
  });

  it("estornar a venda DEVOLVE a recompensa ao cliente (USED→APPROVED)", async () => {
    await call(ctx).sale.abandonDraft();
    const actionId = await makeApprovedFixedDiscount(1500); // R$15
    const saleId = await makeDraftWithCustomer(); // R$100

    await call(ctx).sale.applyRewardDiscount({ saleId, actionId });
    // Total R$85 → paga em dinheiro e finaliza.
    await call(ctx).sale.finalize({
      saleId,
      payments: [{ method: "dinheiro", amount: 8500 }],
    });

    await call(ctx).sale.refund({ saleId, reason: "teste devolucao recompensa" });

    // A recompensa volta a ficar disponível (o cliente não perde o benefício).
    const action = await prisma.rewardAction.findUniqueOrThrow({ where: { id: actionId } });
    expect(action.status).toBe("APPROVED");
    expect(action.usedInSaleId).toBeNull();
    expect(action.usedAt).toBeNull();

    // E aparece de novo entre as disponíveis.
    const available = await call(ctx).reward.getAvailableRewards({ customerId });
    expect(available.some((r: any) => r.id === actionId)).toBe(true);

    // A GAVETA devolve só o que entrou em dinheiro (R$85 pagos), não o total dos
    // itens (R$100): o desconto da recompensa nunca entrou em caixa. A parcela
    // não-dinheiro sai com paymentMethod=null (fora da gaveta — ver M2 no refund).
    const withdrawals = await prisma.cashMovement.findMany({
      where: { referenceId: saleId, type: "WITHDRAWAL", nature: "OUTCOME" },
    });
    const cashWithdrawn = withdrawals
      .filter((w) => w.paymentMethod === "dinheiro")
      .reduce((s, w) => s + Number(w.amount), 0);
    expect(cashWithdrawn).toBe(85);
  });
});
