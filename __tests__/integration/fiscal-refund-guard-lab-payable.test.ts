/**
 * Auditoria 2026-07-25 — itens 11, 12 e 25 (decisões do dono em 2026-07-27).
 *
 * 11 — Estorno de venda/OS com NF-e ATIVA: `sale.refund` e `serviceOrder.refund`
 *      não mencionavam `invoice` uma única vez. Estornar deixava a nota
 *      `AUTHORIZED` na SEFAZ, e o relatório fiscal (que só ignora `CANCELLED`)
 *      seguia contando — a loja declarava faturamento de uma venda que não
 *      existe mais. Agora o estorno é bloqueado até a nota ser cancelada.
 *
 * 12 — `fiscal.inutilizar` era um MOCK que retornava `{ success: true }` sem
 *      falar com a SEFAZ. Pior que não existir: o operador via a confirmação e
 *      considerava resolvido. Agora falha explicitamente.
 *
 * 25 — `updateLabOrderStatus` criava um PAYABLE + Installment quando o lab
 *      devolvia com `finalCost`. O envio ao laboratório é rastreamento de onde
 *      o aparelho está, não documento financeiro — o custo entra nos custos da
 *      OS. Do jeito antigo o mesmo custo contava duas vezes no DRE.
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
const MARK = "fiscal-refund-guard";
let tenantId: string, adminId: string, ctx: any, productId: string, customerId: string, labId: string;
const saleIds: string[] = [];
const orderIds: string[] = [];
const labOrderIds: string[] = [];

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
      availableTenants: [
        {
          id: tenantId,
          slug: "arena-tech",
          role: "admin",
          modules: ["fiscal", "pdv", "stock", "cashier", "financial", "service_order", "operation"],
        },
      ],
    },
    tenantId,
    withTenant: (fn: any) => withTenant(tenantId, fn),
  };
  productId = (
    await prisma.product.create({
      data: { tenantId, name: `${MARK}-p`, salePrice: 100, costPrice: 50, currentStock: 100, active: true },
    })
  ).id;
  customerId = (
    await prisma.customer.create({ data: { tenantId, name: `${MARK}-cliente`, phone: "11999991111" } })
  ).id;
  labId = (await prisma.externalLab.create({ data: { tenantId, name: `${MARK}-lab` } })).id;
  await closeTestCashSessions(prisma, { tenantId, userId: adminId });
  await openTestCashSession(prisma, { tenantId, userId: adminId, initialBalance: 0 });
});

afterAll(async () => {
  for (const loid of labOrderIds) {
    const fts = await prisma.financialTransaction.findMany({
      where: { referenceType: "lab_order", referenceId: loid },
      select: { id: true },
    });
    const ftIds = fts.map((f) => f.id);
    await prisma.labOrder.updateMany({ where: { id: loid }, data: { payableTransactionId: null } });
    await prisma.installment.deleteMany({ where: { transactionId: { in: ftIds } } });
    await prisma.financialTransaction.deleteMany({ where: { id: { in: ftIds } } });
    await prisma.labOrder.deleteMany({ where: { id: loid } });
  }
  for (const oid of orderIds) {
    await prisma.financialTransaction.deleteMany({ where: { serviceOrderId: oid } });
    await prisma.invoice.deleteMany({ where: { referenceId: oid } });
    await prisma.cashMovement.deleteMany({ where: { referenceId: oid } });
    await prisma.serviceOrderHistory.deleteMany({ where: { orderId: oid } });
    await prisma.serviceOrder.deleteMany({ where: { id: oid } });
  }
  for (const sid of saleIds) {
    const invs = await prisma.invoice.findMany({ where: { referenceId: sid }, select: { id: true } });
    const invIds = invs.map((i) => i.id);
    await prisma.invoiceItem.deleteMany({ where: { invoiceId: { in: invIds } } });
    await prisma.invoice.deleteMany({ where: { id: { in: invIds } } });
    const fts = await prisma.financialTransaction.findMany({ where: { saleId: sid }, select: { id: true } });
    const ftIds = fts.map((f) => f.id);
    await prisma.installmentPayment.deleteMany({ where: { transactionId: { in: ftIds } } });
    await prisma.installment.deleteMany({ where: { transactionId: { in: ftIds } } });
    await prisma.financialTransaction.deleteMany({ where: { id: { in: ftIds } } });
    await prisma.cashMovement.deleteMany({ where: { referenceId: sid } });
    await prisma.stockMovement.deleteMany({ where: { referenceId: sid } });
    await prisma.saleAudit.deleteMany({ where: { saleId: sid } });
    await prisma.saleItem.deleteMany({ where: { saleId: sid } });
    await prisma.sale.deleteMany({ where: { id: sid } });
  }
  const open = await prisma.cashSession.findMany({ where: { userId: adminId, closedAt: null }, select: { id: true } });
  for (const s of open) await prisma.cashMovement.deleteMany({ where: { cashSessionId: s.id } });
  await closeTestCashSessions(prisma, { tenantId, userId: adminId });
  await prisma.externalLab.deleteMany({ where: { id: labId } });
  await prisma.customer.deleteMany({ where: { id: customerId } });
  await prisma.product.deleteMany({ where: { id: productId } });
  await prisma.$disconnect();
});

async function makeSale() {
  const c = caller();
  const draft = await c.sale.createDraft();
  saleIds.push(draft.id);
  await c.sale.addItem({ saleId: draft.id, productId, quantity: 1, unitPrice: 10000 });
  await c.sale.finalize({ saleId: draft.id, payments: [{ method: "dinheiro", amount: 10000 }] });
  return draft.id;
}

let osSeq = 0;
async function makePaidOrder(totalCents: number) {
  osSeq += 1;
  const order = await prisma.serviceOrder.create({
    data: {
      tenantId,
      number: `${MARK}-${Date.now()}-${osSeq}`,
      customerId,
      createdById: adminId,
      status: "COMPLETED" as any,
      publicLink: `${MARK}-link-${Date.now()}-${osSeq}`,
      serviceAmount: totalCents / 100,
      totalAmount: totalCents / 100,
      paidAmount: 0,
      budgetPending: false,
    },
  });
  orderIds.push(order.id);
  await caller().serviceOrder.registerPayment({
    id: order.id,
    paymentMethod: "dinheiro",
    paidAmount: totalCents,
  });
  return order.id;
}

describe("11 — estorno bloqueado enquanto a nota fiscal está viva", () => {
  it("venda com NF-e ativa não pode ser estornada", async () => {
    const saleId = await makeSale();
    await caller().fiscal.createFromSale({ saleId, type: "NFE" });

    await expect(
      caller().sale.refund({ saleId, reason: "cliente desistiu" }),
    ).rejects.toThrow(/nota fiscal|documento fiscal/i);

    // A venda continua intacta — o estorno abortou ANTES de qualquer efeito.
    const sale = await prisma.sale.findUniqueOrThrow({ where: { id: saleId } });
    expect(sale.status).toBe("COMPLETED");
    // Nenhuma devolução ao estoque: o estorno abortou antes de mexer em nada.
    const stockBack = await prisma.stockMovement.count({
      where: { referenceId: saleId, type: "ENTRY" },
    });
    expect(stockBack).toBe(0);
  });

  it("depois de cancelar a nota, o estorno da venda passa", async () => {
    const saleId = await makeSale();
    const nota = await caller().fiscal.createFromSale({ saleId, type: "NFE" });
    await prisma.invoice.update({ where: { id: nota.id }, data: { status: "CANCELLED" } });

    await caller().sale.refund({ saleId, reason: "cliente desistiu" });

    const sale = await prisma.sale.findUniqueOrThrow({ where: { id: saleId } });
    expect(sale.status).toBe("REFUNDED");
  });

  it("venda sem nenhuma nota estorna normalmente (o guard não atrapalha o caso comum)", async () => {
    const saleId = await makeSale();
    await caller().sale.refund({ saleId, reason: "troca de produto" });
    const sale = await prisma.sale.findUniqueOrThrow({ where: { id: saleId } });
    expect(sale.status).toBe("REFUNDED");
  });

  it("OS com NF-e ativa não pode ser estornada", async () => {
    const orderId = await makePaidOrder(8000);
    await caller().fiscal.createFromServiceOrder({ serviceOrderId: orderId, type: "NFSE" });

    await expect(
      caller().serviceOrder.refund({ id: orderId, reason: "cliente desistiu do conserto" }),
    ).rejects.toThrow(/nota fiscal|documento fiscal/i);

    const order = await prisma.serviceOrder.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).toBe("PAID");
    // Nenhuma saída de caixa foi lançada — o estorno abortou antes.
    const withdrawal = await prisma.cashMovement.count({
      where: { referenceId: orderId, nature: "OUTCOME", type: "WITHDRAWAL" },
    });
    expect(withdrawal).toBe(0);
  });

  it("depois de cancelar a nota, o estorno da OS passa", async () => {
    const orderId = await makePaidOrder(7000);
    const nota = await caller().fiscal.createFromServiceOrder({ serviceOrderId: orderId, type: "NFSE" });
    await prisma.invoice.update({ where: { id: nota.id }, data: { status: "CANCELLED" } });

    await caller().serviceOrder.refund({ id: orderId, reason: "cliente desistiu do conserto" });

    const order = await prisma.serviceOrder.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).toBe("REFUNDED");
  });
});

describe("12 — inutilizar não finge mais sucesso", () => {
  it("falha explicitamente em vez de retornar { success: true }", async () => {
    await expect(
      caller().fiscal.inutilizar({
        model: "55",
        series: "1",
        startNumber: 10,
        endNumber: 12,
        justification: "quebra de sequencia por erro no sistema",
      }),
    ).rejects.toThrow(/nao esta implementada|SEFAZ/i);
  });
});

describe("25 — envio ao laboratório não gera conta a pagar", () => {
  it("devolução com custo final não cria PAYABLE nem parcela", async () => {
    const created = await caller().operation.createLabOrder({
      labId,
      deviceDescription: `${MARK}-aparelho`,
      problem: "nao liga",
      estimatedCost: 5000,
    });
    labOrderIds.push(created.id);

    await caller().operation.updateLabOrderStatus({
      id: created.id,
      status: "RETURNED",
      finalCost: 6000,
    });

    const payables = await prisma.financialTransaction.count({
      where: { referenceType: "lab_order", referenceId: created.id },
    });
    expect(payables).toBe(0);

    const labOrder = await prisma.labOrder.findUniqueOrThrow({ where: { id: created.id } });
    expect(labOrder.payableTransactionId).toBeNull();
    // O custo continua registrado no envio — só não vira documento financeiro.
    expect(Number(labOrder.finalCost)).toBe(60);
    expect(labOrder.status).toBe("RETURNED");
  });
});
