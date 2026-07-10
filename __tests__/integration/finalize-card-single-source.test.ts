/**
 * Validação empírica R4 fase 2 (roda o finalize REAL contra o Postgres local).
 *
 * Invariante: dinheiro de CARTÃO vira CardReceivable e NÃO gera
 * FinancialTransaction; dinheiro NÃO-cartão gera FinancialTransaction.
 * Skill empirical-validation: reconcilia o resultado no banco, vira regressão.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
// Stub do auth (next-auth importa next/server, inviável em node). O ctx é manual.
vi.mock("@/server/auth", () => ({ auth: async () => null }));
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createCallerFactory } from "@/server/api/trpc";
import { appRouter } from "@/server/api/root";
import { withTenant } from "@/server/db";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

let ctx: any;
let productId: string;
let cardMethodId: string;
let acquirerId: string;
let brandId: string;
const createdSaleIds: string[] = [];
const MARK = "r4-fase2-test";

beforeAll(async () => {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "arena-tech" } });
  const admin = await prisma.user.findFirstOrThrow({ where: { name: "Admin Arena" } });
  const tenantId = tenant.id;
  ctx = {
    session: { user: { id: admin.id, isSuperAdmin: false }, activeTenantId: tenantId, availableTenants: [{ id: tenantId, slug: "arena-tech", role: "admin" }] },
    tenantId,
    withTenant: (fn: any) => withTenant(tenantId, fn),
  };

  const product = await prisma.product.create({
    data: { tenantId, name: `${MARK}-produto`, salePrice: 100, costPrice: 50, currentStock: 100, isDevice: false, isSerialized: false, hasVariations: false, active: true },
  });
  productId = product.id;

  const method = await prisma.paymentMethod.create({
    data: { tenantId, name: `${MARK}-credito`, code: "cartao_credito", type: "CREDIT_CARD", acceptsInstallments: true, installmentsMin: 1, installmentsMax: 12, settlementDays: 0, feePercent: 0, feeFixed: 0, feePolicy: "LOJA_ABSORVE", acceptsChange: false, active: true },
  });
  cardMethodId = method.id;

  const acquirer = await prisma.acquirer.create({ data: { tenantId, name: `${MARK}-acq`, active: true } });
  acquirerId = acquirer.id;
  const brand = await prisma.cardBrand.create({ data: { tenantId, name: `${MARK}-visa`, active: true } });
  brandId = brand.id;
  for (const inst of [1, 3]) {
    await prisma.acquirerRate.create({
      data: { tenantId, acquirerId, cardBrandId: brandId, kind: "CREDIT", installments: inst, feePercent: 3, feeFixed: 0, settlementDays: 1, active: true },
    });
  }

  // Caixa aberto (finalize exige p/ pagamento em dinheiro). Aberto = closedAt null.
  await prisma.cashSession.deleteMany({ where: { userId: admin.id, closedAt: null } });
  await prisma.cashSession.create({
    data: { tenantId, userId: admin.id, initialBalance: 0 },
  });
});

afterAll(async () => {
  for (const sid of createdSaleIds) {
    await prisma.cardReceivable.deleteMany({ where: { saleId: sid } });
    await prisma.installment.deleteMany({ where: { transaction: { saleId: sid } } });
    await prisma.financialTransaction.deleteMany({ where: { saleId: sid } });
    await prisma.cashMovement.deleteMany({ where: { referenceId: sid } });
    await prisma.stockMovement.deleteMany({ where: { referenceId: sid } });
    await prisma.saleItem.deleteMany({ where: { saleId: sid } });
    await prisma.sale.deleteMany({ where: { id: sid } });
  }
  await prisma.acquirerRate.deleteMany({ where: { acquirerId } });
  await prisma.cardBrand.deleteMany({ where: { id: brandId } });
  await prisma.acquirer.deleteMany({ where: { id: acquirerId } });
  await prisma.paymentMethod.deleteMany({ where: { id: cardMethodId } });
  await prisma.cashSession.deleteMany({ where: { userId: ctx.session.user.id, closedAt: null } });
  await prisma.product.deleteMany({ where: { id: productId } });
  await prisma.$disconnect();
});

async function makeSale(payments: any[]) {
  const caller = createCallerFactory(appRouter)(ctx);
  const draft = await caller.sale.createDraft();
  createdSaleIds.push(draft.id);
  await caller.sale.addItem({ saleId: draft.id, productId, quantity: 1, unitPrice: 10000 }); // R$100
  await caller.sale.finalize({ saleId: draft.id, payments });
  return draft.id;
}

async function counts(saleId: string) {
  const ft = await prisma.financialTransaction.count({ where: { saleId, type: "RECEIVABLE" } });
  const cr = await prisma.cardReceivable.count({ where: { saleId } });
  return { ft, cr };
}

describe("R4 fase 2 — cartão = fonte única (finalize real)", () => {
  it("DINHEIRO à vista → 1 FinancialTransaction, 0 CardReceivable", async () => {
    const saleId = await makeSale([{ method: "dinheiro", amount: 10000 }]);
    expect(await counts(saleId)).toEqual({ ft: 1, cr: 0 });
  });

  it("CARTÃO crédito 1x → 0 FinancialTransaction, 1 CardReceivable", async () => {
    const saleId = await makeSale([
      { method: "cartao_credito", paymentMethodId: cardMethodId, acquirerId, cardBrandId: brandId, cardKind: "CREDIT", installments: 1, amount: 10000 },
    ]);
    expect(await counts(saleId)).toEqual({ ft: 0, cr: 1 });
  });

  it("CARTÃO crédito 3x → 0 FinancialTransaction, 3 CardReceivable", async () => {
    const saleId = await makeSale([
      { method: "cartao_credito", paymentMethodId: cardMethodId, acquirerId, cardBrandId: brandId, cardKind: "CREDIT", installments: 3, amount: 10000 },
    ]);
    expect(await counts(saleId)).toEqual({ ft: 0, cr: 3 });
  });
});
