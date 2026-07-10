/**
 * Auditoria OS — validação ao vivo (finalize/refund reais contra Postgres local).
 * F1: refund de OS cancela o CardReceivable PENDING da venda vinculada.
 * F2: registerPayment de OS rejeita métodos de cartão (deve ir pelo PDV).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
vi.mock("@/server/auth", () => ({ auth: async () => null }));
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createCallerFactory } from "@/server/api/trpc";
import { appRouter } from "@/server/api/root";
import { withTenant } from "@/server/db";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const MARK = "os-audit-test";
let ctx: any, tenantId: string, adminId: string;
let customerId: string, acquirerId: string, brandId: string;
const cleanup: { sales: string[]; orders: string[] } = { sales: [], orders: [] };

async function caller() {
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
  const customer = await prisma.customer.create({ data: { tenantId, name: `${MARK}-cliente`, phone: "11999990000" } });
  customerId = customer.id;
  acquirerId = (await prisma.acquirer.create({ data: { tenantId, name: `${MARK}-acq`, active: true } })).id;
  brandId = (await prisma.cardBrand.create({ data: { tenantId, name: `${MARK}-brand`, active: true } })).id;
  // Caixa aberto (refund/registerPayment exigem).
  await prisma.cashSession.deleteMany({ where: { userId: adminId, closedAt: null } });
  await prisma.cashSession.create({ data: { tenantId, userId: adminId, initialBalance: 0 } });
});

afterAll(async () => {
  for (const sid of cleanup.sales) {
    await prisma.cardReceivable.deleteMany({ where: { saleId: sid } });
    await prisma.financialTransaction.deleteMany({ where: { saleId: sid } });
    await prisma.cashMovement.deleteMany({ where: { referenceId: sid } });
    await prisma.sale.deleteMany({ where: { id: sid } });
  }
  for (const oid of cleanup.orders) {
    await prisma.financialTransaction.deleteMany({ where: { serviceOrderId: oid } });
    await prisma.cashMovement.deleteMany({ where: { referenceId: oid } });
    await prisma.serviceOrderHistory.deleteMany({ where: { orderId: oid } });
    await prisma.serviceOrder.deleteMany({ where: { id: oid } });
  }
  // cashMovements da sessão do admin (o registerPayment/refund de OS geram
  // movimentos referenciando a sessão) — remove antes de apagar a cashSession.
  const openSessions = await prisma.cashSession.findMany({ where: { userId: adminId, closedAt: null }, select: { id: true } });
  for (const s of openSessions) {
    await prisma.cashMovement.deleteMany({ where: { cashSessionId: s.id } });
  }
  await prisma.cardBrand.deleteMany({ where: { id: brandId } });
  await prisma.acquirer.deleteMany({ where: { id: acquirerId } });
  await prisma.cashSession.deleteMany({ where: { userId: adminId, closedAt: null } });
  await prisma.customer.deleteMany({ where: { id: customerId } });
  await prisma.$disconnect();
});

let seq = 0;
async function makeOrder(status: string, totalCents: number) {
  seq += 1;
  const order = await prisma.serviceOrder.create({
    data: {
      tenantId, number: `${MARK}-${Date.now()}-${seq}`, customerId, createdById: adminId,
      status: status as any, publicLink: `${MARK}-link-${Date.now()}-${seq}`,
      serviceAmount: totalCents / 100, totalAmount: totalCents / 100,
      paidAmount: status === "PAID" ? totalCents / 100 : 0, budgetPending: false,
    },
  });
  cleanup.orders.push(order.id);
  return order;
}

describe("Auditoria OS — F1/F2 (ao vivo)", () => {
  it("F1: refund de OS cancela o CardReceivable PENDING da venda vinculada", async () => {
    const order = await makeOrder("PAID", 10000);
    // Venda vinculada (isOSPayment) COMPLETED + CardReceivable PENDING.
    const sale = await prisma.sale.create({
      data: {
        tenantId, number: `${MARK}-sale-${Date.now()}`, sellerId: adminId,
        publicLink: `${MARK}-slink-${Date.now()}`, status: "COMPLETED" as any,
        isOSPayment: true, serviceOrderId: order.id, totalAmount: 100, paidAmount: 100,
      },
    });
    cleanup.sales.push(sale.id);
    const cr = await prisma.cardReceivable.create({
      data: {
        tenantId, saleId: sale.id, acquirerId, cardBrandId: brandId, kind: "CREDIT" as any,
        installmentNumber: 1, installmentsTotal: 1, grossAmount: 100, feeAmount: 3, netAmount: 97,
        expectedSettlementDate: new Date(Date.now() + 30 * 864e5), status: "PENDING" as any,
      },
    });

    await (await caller()).serviceOrder.refund({ id: order.id, reason: "teste de estorno F1 auditoria" });

    const crAfter = await prisma.cardReceivable.findUniqueOrThrow({ where: { id: cr.id } });
    const saleAfter = await prisma.sale.findUniqueOrThrow({ where: { id: sale.id } });
    expect(crAfter.status).toBe("CANCELLED"); // ← o fix F1
    expect(saleAfter.status).toBe("REFUNDED");
  });

  it("F2: registerPayment de OS rejeita cartão (deve ir pelo PDV)", async () => {
    const order = await makeOrder("COMPLETED", 5000);
    await expect(
      (await caller()).serviceOrder.registerPayment({ id: order.id, paymentMethod: "cartao_credito", paidAmount: 5000 }),
    ).rejects.toThrow(/cart[aã]o de OS deve ser feito pelo PDV/i);
  });
});
