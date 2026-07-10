/**
 * Auditoria PDV — validação ao vivo (finalize + getById reais).
 * Bug: paymentDetails[].method guardava o UUID de um PaymentMethod cadastrado,
 * e a UI/recibo mostravam o UUID cru ("a6b9e67e-...") no lugar do nome.
 * Fix: finalize persiste methodLabel; getById resolve o nome (vendas antigas).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
vi.mock("@/server/auth", () => ({ auth: async () => null }));
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createCallerFactory } from "@/server/api/trpc";
import { appRouter } from "@/server/api/root";
import { withTenant } from "@/server/db";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const MARK = "pay-label-test";
let ctx: any, tenantId: string, adminId: string;
let productId: string, pixMethodId: string;
const saleIds: string[] = [];

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
  // PaymentMethod cadastrado (PIX) — o `method` gravado será este UUID.
  pixMethodId = (await prisma.paymentMethod.create({
    data: { tenantId, name: `${MARK}-PIX Loja`, code: "pix_loja", type: "PIX", acceptsInstallments: false, installmentsMin: 1, installmentsMax: 1, settlementDays: 0, feePercent: 0, feeFixed: 0, feePolicy: "LOJA_ABSORVE", acceptsChange: false, active: true },
  })).id;
  await prisma.cashSession.deleteMany({ where: { userId: adminId, closedAt: null } });
  await prisma.cashSession.create({ data: { tenantId, userId: adminId, initialBalance: 0 } });
});

afterAll(async () => {
  for (const sid of saleIds) {
    await prisma.financialTransaction.deleteMany({ where: { saleId: sid } });
    await prisma.cashMovement.deleteMany({ where: { referenceId: sid } });
    await prisma.stockMovement.deleteMany({ where: { referenceId: sid } });
    await prisma.saleItem.deleteMany({ where: { saleId: sid } });
    await prisma.sale.deleteMany({ where: { id: sid } });
  }
  const open = await prisma.cashSession.findMany({ where: { userId: adminId, closedAt: null }, select: { id: true } });
  for (const s of open) await prisma.cashMovement.deleteMany({ where: { cashSessionId: s.id } });
  await prisma.paymentMethod.deleteMany({ where: { id: pixMethodId } });
  await prisma.cashSession.deleteMany({ where: { userId: adminId, closedAt: null } });
  await prisma.product.deleteMany({ where: { id: productId } });
  await prisma.$disconnect();
});

async function makeSale(payments: any[]) {
  const c = caller();
  const draft = await c.sale.createDraft();
  saleIds.push(draft.id);
  await c.sale.addItem({ saleId: draft.id, productId, quantity: 1, unitPrice: 10000 });
  await c.sale.finalize({ saleId: draft.id, payments });
  return draft.id;
}

describe("Auditoria PDV — rótulo da forma de pagamento (ao vivo)", () => {
  it("método cadastrado (UUID): finalize persiste methodLabel e getById resolve o nome", async () => {
    const saleId = await makeSale([
      { method: pixMethodId, paymentMethodId: pixMethodId, amount: 10000, installments: 1 },
    ]);

    // 1) dado persistido: methodLabel = nome do método, method continua o UUID.
    const raw = await prisma.sale.findUniqueOrThrow({ where: { id: saleId }, select: { paymentDetails: true } });
    const legs = raw.paymentDetails as Array<{ method: string; methodLabel?: string }>;
    expect(legs[0]!.method).toBe(pixMethodId);
    expect(legs[0]!.methodLabel).toBe(`${MARK}-PIX Loja`);

    // 2) getById resolve o nome (conserta também vendas antigas sem methodLabel).
    const sale = await caller().sale.getById({ id: saleId });
    const pd = sale.paymentDetails as Array<{ method: string; methodLabel?: string }>;
    expect(pd[0]!.methodLabel).toBe(`${MARK}-PIX Loja`);
    // Nunca expõe o UUID cru como rótulo.
    expect(pd[0]!.methodLabel).not.toMatch(/^[0-9a-f-]{36}$/i);
  });

  it("getById resolve nome para venda ANTIGA (sem methodLabel gravado)", async () => {
    const saleId = await makeSale([
      { method: pixMethodId, paymentMethodId: pixMethodId, amount: 10000, installments: 1 },
    ]);
    // Simula venda antiga: remove methodLabel do dado gravado.
    await prisma.sale.update({
      where: { id: saleId },
      data: { paymentDetails: [{ method: pixMethodId, amount: 10000, installments: 1 }] },
    });

    const sale = await caller().sale.getById({ id: saleId });
    const pd = sale.paymentDetails as Array<{ method: string; methodLabel?: string }>;
    expect(pd[0]!.methodLabel).toBe(`${MARK}-PIX Loja`); // resolvido on-the-fly
  });

  it("método nativo (dinheiro): methodLabel = 'Dinheiro'", async () => {
    const saleId = await makeSale([{ method: "dinheiro", amount: 10000 }]);
    const sale = await caller().sale.getById({ id: saleId });
    const pd = sale.paymentDetails as Array<{ method: string; methodLabel?: string }>;
    expect(pd[0]!.methodLabel).toBe("Dinheiro");
  });
});
