/**
 * Auditoria OS — validação ao vivo (refund real contra Postgres local).
 * F3: refund de OS paga DIRETO (registerPayment, sem venda no PDV) reverte o
 *     recebível próprio (RECEIVABLE → CANCELLED) E a entrada de caixa
 *     (WITHDRAWAL/OUTCOME). Antes o dinheiro ficava "recebido" após o estorno.
 * F6: CAS no status — um segundo refund concorrente sobre a mesma OS falha com
 *     CONFLICT em vez de reverter o dinheiro em dobro.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
vi.mock("@/server/auth", () => ({ auth: async () => null }));
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createCallerFactory } from "@/server/api/trpc";
import { appRouter } from "@/server/api/root";
import { withTenant } from "@/server/db";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const MARK = "os-refund-direct-test";
let ctx: any, tenantId: string, adminId: string, customerId: string;
const cleanup: { orders: string[] } = { orders: [] };

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
  customerId = (await prisma.customer.create({ data: { tenantId, name: `${MARK}-cliente`, phone: "11999990000" } })).id;
  await prisma.cashSession.deleteMany({ where: { userId: adminId, closedAt: null } });
  await prisma.cashSession.create({ data: { tenantId, userId: adminId, initialBalance: 0 } });
});

afterAll(async () => {
  for (const oid of cleanup.orders) {
    await prisma.financialTransaction.deleteMany({ where: { serviceOrderId: oid } });
    await prisma.cashMovement.deleteMany({ where: { referenceId: oid } });
    await prisma.serviceOrderHistory.deleteMany({ where: { orderId: oid } });
    await prisma.serviceOrder.deleteMany({ where: { id: oid } });
  }
  const openSessions = await prisma.cashSession.findMany({ where: { userId: adminId, closedAt: null }, select: { id: true } });
  for (const s of openSessions) {
    await prisma.cashMovement.deleteMany({ where: { cashSessionId: s.id } });
  }
  await prisma.cashSession.deleteMany({ where: { userId: adminId, closedAt: null } });
  await prisma.customer.deleteMany({ where: { id: customerId } });
  await prisma.$disconnect();
});

let seq = 0;
async function makeCompletedOrder(totalCents: number) {
  seq += 1;
  const order = await prisma.serviceOrder.create({
    data: {
      tenantId, number: `${MARK}-${Date.now()}-${seq}`, customerId, createdById: adminId,
      status: "COMPLETED" as any, publicLink: `${MARK}-link-${Date.now()}-${seq}`,
      serviceAmount: totalCents / 100, totalAmount: totalCents / 100, paidAmount: 0, budgetPending: false,
    },
  });
  cleanup.orders.push(order.id);
  return order;
}

describe("Auditoria OS — F3/F6 (ao vivo)", () => {
  it("F3: refund de OS paga em dinheiro (sem Sale) reverte recebível + caixa", async () => {
    const order = await makeCompletedOrder(8000);
    const c = await caller();

    // Paga direto em dinheiro (registerPayment → settleOsPaymentRecords).
    await c.serviceOrder.registerPayment({ id: order.id, paymentMethod: "dinheiro", paidAmount: 8000 });

    // Estado pós-pagamento: recebível PAID + entrada de caixa INCOME.
    const rcvBefore = await prisma.financialTransaction.findFirstOrThrow({
      where: { referenceType: "service_order", referenceId: order.id, type: "RECEIVABLE" },
    });
    expect(rcvBefore.status).toBe("PAID");
    const incomeBefore = await prisma.cashMovement.findFirst({
      where: { referenceId: order.id, nature: "INCOME" },
    });
    expect(incomeBefore).not.toBeNull();

    // Estorna.
    await c.serviceOrder.refund({ id: order.id, reason: "teste estorno F3 direto dinheiro" });

    // F3: recebível cancelado + saída de caixa (WITHDRAWAL/OUTCOME) com o método original.
    const rcvAfter = await prisma.financialTransaction.findUniqueOrThrow({ where: { id: rcvBefore.id } });
    expect(rcvAfter.status).toBe("CANCELLED");
    const withdrawal = await prisma.cashMovement.findFirst({
      where: { referenceId: order.id, nature: "OUTCOME", type: "WITHDRAWAL" },
    });
    expect(withdrawal).not.toBeNull();
    expect(Number(withdrawal!.amount)).toBe(80); // 8000 cents
    expect(withdrawal!.paymentMethod).toBe("dinheiro");

    const orderAfter = await prisma.serviceOrder.findUniqueOrThrow({ where: { id: order.id } });
    expect(orderAfter.status).toBe("REFUNDED");
  });

  it("F3: OS paga em pix reverte recebível (pix não afeta gaveta de dinheiro)", async () => {
    const order = await makeCompletedOrder(5000);
    const c = await caller();
    await c.serviceOrder.registerPayment({ id: order.id, paymentMethod: "pix", paidAmount: 5000 });

    await c.serviceOrder.refund({ id: order.id, reason: "teste estorno F3 direto pix" });

    const rcv = await prisma.financialTransaction.findFirstOrThrow({
      where: { referenceType: "service_order", referenceId: order.id, type: "RECEIVABLE" },
    });
    expect(rcv.status).toBe("CANCELLED");
    // WITHDRAWAL registrado com método pix (não conta pra gaveta de dinheiro,
    // mas mantém a trilha de auditoria consistente).
    const withdrawal = await prisma.cashMovement.findFirst({
      where: { referenceId: order.id, nature: "OUTCOME", type: "WITHDRAWAL" },
    });
    expect(withdrawal?.paymentMethod).toBe("pix");
  });

  it("F6: refund concorrente sobre a mesma OS falha (CAS), sem reverter em dobro", async () => {
    const order = await makeCompletedOrder(9000);
    const c = await caller();
    await c.serviceOrder.registerPayment({ id: order.id, paymentMethod: "dinheiro", paidAmount: 9000 });

    // Dois refunds em paralelo: um vence, o outro deve falhar (CONFLICT).
    const results = await Promise.allSettled([
      c.serviceOrder.refund({ id: order.id, reason: "estorno concorrente A F6" }),
      c.serviceOrder.refund({ id: order.id, reason: "estorno concorrente B F6" }),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    // Exatamente UM WITHDRAWAL — o dinheiro não foi revertido em dobro.
    const withdrawals = await prisma.cashMovement.count({
      where: { referenceId: order.id, nature: "OUTCOME", type: "WITHDRAWAL" },
    });
    expect(withdrawals).toBe(1);
  });
});
