/**
 * Auditoria PDV — validação ao vivo (finalize/refund reais contra Postgres local).
 * M2: estorno de venda paga em DINHEIRO gera WITHDRAWAL com paymentMethod="dinheiro"
 *     (visível na conferência da gaveta); venda paga em CARTÃO gera WITHDRAWAL null
 *     (fora da gaveta — a adquirente estorna).
 * A2: finalize rejeita valor acima do teto sanitário (overflow de troco/caixa).
 * M1/E3: divergência de valor DePix no finalize grava saleAudit
 *     (payment_value_mismatch) e NÃO bloqueia (fail-open).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
vi.mock("@/server/auth", () => ({ auth: async () => null }));
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createCallerFactory } from "@/server/api/trpc";
import { appRouter } from "@/server/api/root";
import { withTenant } from "@/server/db";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const MARK = "pdv-recon-test";
let ctx: any, tenantId: string, adminId: string;
let productId: string, cardMethodId: string, acquirerId: string, brandId: string;
const saleIds: string[] = [];
const depixTxIds: string[] = [];

function caller() {
  return createCallerFactory(appRouter)(ctx);
}

beforeAll(async () => {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "arena-tech" } });
  const admin = await prisma.user.findFirstOrThrow({ where: { name: "Admin Arena" } });
  tenantId = tenant.id; adminId = admin.id;
  ctx = {
    session: { user: { id: adminId, isSuperAdmin: false }, activeTenantId: tenantId, availableTenants: [{ id: tenantId, slug: "arena-tech", role: "admin" }] },
    tenantId, withTenant: (fn: any) => withTenant(tenantId, fn),
  };
  productId = (await prisma.product.create({
    data: { tenantId, name: `${MARK}-produto`, salePrice: 100, costPrice: 50, currentStock: 100, isDevice: false, isSerialized: false, hasVariations: false, active: true },
  })).id;
  cardMethodId = (await prisma.paymentMethod.create({
    data: { tenantId, name: `${MARK}-credito`, code: "cartao_credito", type: "CREDIT_CARD", acceptsInstallments: true, installmentsMin: 1, installmentsMax: 12, settlementDays: 0, feePercent: 0, feeFixed: 0, feePolicy: "LOJA_ABSORVE", acceptsChange: false, active: true },
  })).id;
  acquirerId = (await prisma.acquirer.create({ data: { tenantId, name: `${MARK}-acq`, active: true } })).id;
  brandId = (await prisma.cardBrand.create({ data: { tenantId, name: `${MARK}-visa`, active: true } })).id;
  await prisma.acquirerRate.create({
    data: { tenantId, acquirerId, cardBrandId: brandId, kind: "CREDIT", installments: 1, feePercent: 3, feeFixed: 0, settlementDays: 1, active: true },
  });
  await prisma.cashSession.deleteMany({ where: { userId: adminId, closedAt: null } });
  await prisma.cashSession.create({ data: { tenantId, userId: adminId, initialBalance: 0 } });
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
  if (depixTxIds.length) await prisma.tenantDepixTransaction.deleteMany({ where: { id: { in: depixTxIds } } });
  const open = await prisma.cashSession.findMany({ where: { userId: adminId, closedAt: null }, select: { id: true } });
  for (const s of open) await prisma.cashMovement.deleteMany({ where: { cashSessionId: s.id } });
  await prisma.acquirerRate.deleteMany({ where: { acquirerId } });
  await prisma.cardBrand.deleteMany({ where: { id: brandId } });
  await prisma.acquirer.deleteMany({ where: { id: acquirerId } });
  await prisma.paymentMethod.deleteMany({ where: { id: cardMethodId } });
  await prisma.cashSession.deleteMany({ where: { userId: adminId, closedAt: null } });
  await prisma.product.deleteMany({ where: { id: productId } });
  await prisma.$disconnect();
});

async function makeSale(payments: any[]) {
  const c = caller();
  const draft = await c.sale.createDraft();
  saleIds.push(draft.id);
  await c.sale.addItem({ saleId: draft.id, productId, quantity: 1, unitPrice: 10000 }); // R$100
  await c.sale.finalize({ saleId: draft.id, payments });
  return draft.id;
}

describe("Auditoria PDV — M2/A2/M1 (ao vivo)", () => {
  it("M2: estorno de venda em DINHEIRO → WITHDRAWAL paymentMethod='dinheiro' (na gaveta)", async () => {
    const saleId = await makeSale([{ method: "dinheiro", amount: 10000 }]);
    await caller().sale.refund({ saleId, reason: "teste estorno dinheiro M2" });

    const withdrawals = await prisma.cashMovement.findMany({
      where: { referenceId: saleId, type: "WITHDRAWAL", nature: "OUTCOME" },
    });
    expect(withdrawals).toHaveLength(1);
    expect(withdrawals[0]!.paymentMethod).toBe("dinheiro"); // ← o fix M2 (conta na gaveta)
    expect(Number(withdrawals[0]!.amount)).toBe(100);
  });

  it("M2: estorno de venda em CARTÃO → WITHDRAWAL paymentMethod=null (fora da gaveta)", async () => {
    const saleId = await makeSale([
      { method: "cartao_credito", paymentMethodId: cardMethodId, acquirerId, cardBrandId: brandId, cardKind: "CREDIT", installments: 1, amount: 10000 },
    ]);
    await caller().sale.refund({ saleId, reason: "teste estorno cartao M2" });

    const withdrawals = await prisma.cashMovement.findMany({
      where: { referenceId: saleId, type: "WITHDRAWAL", nature: "OUTCOME" },
    });
    expect(withdrawals).toHaveLength(1);
    expect(withdrawals[0]!.paymentMethod).toBeNull(); // cartão: adquirente estorna, não a gaveta
  });

  it("A2: finalize rejeita valor de pagamento acima do teto sanitário", async () => {
    const c = caller();
    const draft = await c.sale.createDraft();
    saleIds.push(draft.id);
    await c.sale.addItem({ saleId: draft.id, productId, quantity: 1, unitPrice: 10000 });
    await expect(
      c.sale.finalize({ saleId: draft.id, payments: [{ method: "dinheiro", amount: 900_000_000 }] }),
    ).rejects.toThrow(/limite permitido|acima do limite/i);
    // Abandona o draft não-finalizado para não ser reaproveitado pelo próximo
    // createDraft (o PDV reusa o rascunho aberto do vendedor) — evita poluir o
    // total do teste seguinte.
    await c.sale.abandonDraft();
  });

  it("M1/E3: divergência de valor DePix grava saleAudit e finaliza (fail-open)", async () => {
    const c = caller();
    const draft = await c.sale.createDraft();
    saleIds.push(draft.id);
    await c.sale.addItem({ saleId: draft.id, productId, quantity: 1, unitPrice: 10000 }); // R$100

    // Cria uma tx DePix liquidada, vinculada à venda, mas com valor MENOR (R$50)
    // que o leg que o finalize vai cobrar (R$100). Status COMPLETED = settled.
    const depixTx = await prisma.tenantDepixTransaction.create({
      data: {
        tenantId, userId: adminId, number: `${MARK}-dtx-${Date.now()}`,
        kind: "DEPOSIT", status: "COMPLETED",
        grossAmountCents: 5000, netAmountCents: 5000,
        sourceType: "SALE", sourceId: draft.id,
        pixApprovedAt: new Date(),
      },
    });
    depixTxIds.push(depixTx.id);

    const beforeFinalize = await prisma.sale.findUniqueOrThrow({ where: { id: draft.id } });
    expect(Number(beforeFinalize.totalAmount)).toBe(100); // R$100 — sanity do total

    await c.sale.finalize({
      saleId: draft.id,
      payments: [{ method: "depix", amount: 10000, walletTransactionId: depixTx.id }],
    });

    // Finalizou (fail-open) E registrou a divergência.
    const sale = await prisma.sale.findUniqueOrThrow({ where: { id: draft.id } });
    expect(sale.status).toBe("COMPLETED");
    const audit = await prisma.saleAudit.findFirst({
      where: { saleId: draft.id, action: "payment_value_mismatch" },
    });
    expect(audit).not.toBeNull();
    expect(audit!.field).toBe("depix");
    expect(audit!.previousValue).toBe("10000"); // cobrado
    expect(audit!.newValue).toBe("5000");        // liquidado
  });
});
