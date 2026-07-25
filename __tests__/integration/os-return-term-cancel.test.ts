/**
 * Auditoria 2026-07-25 — cancelamento da OS pelo TERMO DE DEVOLUÇÃO.
 *
 * BUG: existem 4 caminhos que gravam `status: "CANCELLED"` na OS, mas só o
 * `cancel` (service-order.ts:1097) executa o cancelamento de verdade — CAS de
 * status + `releaseAllOsItems` (devolve o estoque reservado) + cancelamento dos
 * recebíveis pendentes + RBAC para forçar sem termo.
 *
 * `confirmPhysicalReturnTerm` e `checkReturnTermStatus` gravam CANCELLED com um
 * `update()` cru: o estoque reservado NUNCA volta, os recebíveis continuam
 * vencendo, não há guard de status (uma OS PAID é cancelada sem estorno) e não
 * há `isTenantAdmin` (operador comum passa por cima do gate do `cancel`).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
vi.mock("@/server/auth", () => ({ auth: async () => null }));
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createCallerFactory } from "@/server/api/trpc";
import { appRouter } from "@/server/api/root";
import { withTenant } from "@/server/db";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const MARK = "os-return-term";
let tenantId: string, adminId: string, operatorId: string, customerId: string, productId: string;
const orderIds: string[] = [];

function mkCtx(userId: string, role: "admin" | "operator") {
  return {
    session: {
      user: { id: userId, isSuperAdmin: false },
      activeTenantId: tenantId,
      availableTenants: [{ id: tenantId, slug: "arena-tech", role, isTechnician: false }],
    },
    tenantId,
    withTenant: (fn: any) => withTenant(tenantId, fn),
  } as any;
}
const caller = (ctx: any) => createCallerFactory(appRouter)(ctx);

beforeAll(async () => {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "arena-tech" } });
  const admin = await prisma.user.findFirstOrThrow({ where: { name: "Admin Arena" } });
  const operator = await prisma.user.findFirstOrThrow({ where: { name: "Operador Arena" } });
  tenantId = tenant.id;
  adminId = admin.id;
  operatorId = operator.id;
  customerId = (await prisma.customer.create({ data: { tenantId, name: `${MARK}-c`, phone: "11977776666" } })).id;
  productId = (await prisma.product.create({
    data: { tenantId, name: `${MARK}-peca`, salePrice: 200, costPrice: 100, currentStock: 10, active: true },
  })).id;
});

afterAll(async () => {
  for (const id of orderIds) {
    await prisma.installment.deleteMany({ where: { transaction: { serviceOrderId: id } } });
    await prisma.financialTransaction.deleteMany({ where: { serviceOrderId: id } });
    await prisma.stockMovement.deleteMany({ where: { referenceId: id } });
    await prisma.serviceOrderHistory.deleteMany({ where: { orderId: id } });
    await prisma.serviceOrderItem.deleteMany({ where: { orderId: id } });
  }
  await prisma.serviceOrder.deleteMany({ where: { id: { in: orderIds } } });
  await prisma.product.deleteMany({ where: { id: productId } });
  await prisma.customer.deleteMany({ where: { id: customerId } });
  await prisma.$disconnect();
});

let seq = 0;
async function mkOrder(status: string) {
  seq += 1;
  const o = await prisma.serviceOrder.create({
    data: {
      tenantId,
      number: `${MARK}-${Date.now()}-${seq}`,
      customerId,
      createdById: adminId,
      status: status as any,
      publicLink: `${MARK}-pl-${Date.now()}-${seq}`,
      totalAmount: 200,
      serviceAmount: 200,
      // entrada assinada: é o cenário em que o `cancel` EXIGE termo de devolução
      signatureSignedAt: new Date(),
    },
  });
  orderIds.push(o.id);
  return o;
}

describe("OS — cancelamento via termo de devolução deve cancelar de verdade", () => {
  it("devolve ao estoque a peça reservada (hoje o estoque fica preso)", async () => {
    const order = await mkOrder("IN_PROGRESS");
    // Reserva 1 peça do estoque para a OS (decrementa currentStock).
    await caller(mkCtx(adminId, "admin")).serviceOrder.addItem({
      orderId: order.id,
      type: "PRODUCT",
      productId,
      description: `${MARK}-peca`,
      quantity: 1,
      unitPrice: 20000,
    });
    const afterReserve = await prisma.product.findUniqueOrThrow({ where: { id: productId } });

    await caller(mkCtx(adminId, "admin")).serviceOrder.confirmPhysicalReturnTerm({ orderId: order.id });

    const afterCancel = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
    expect(afterCancel.currentStock).toBe(afterReserve.currentStock + 1);
  });

  it("cancela os recebíveis pendentes da OS (hoje ficam vencendo para sempre)", async () => {
    const order = await mkOrder("IN_PROGRESS");
    const ft = await prisma.financialTransaction.create({
      data: {
        tenantId,
        serviceOrderId: order.id,
        type: "RECEIVABLE",
        description: `${MARK}-recebivel`,
        totalAmount: 200,
        status: "PENDING",
        emissionDate: new Date(),
        dueDate: new Date(),
        createdByUserId: adminId,
      },
    });

    await caller(mkCtx(adminId, "admin")).serviceOrder.confirmPhysicalReturnTerm({ orderId: order.id });

    const after = await prisma.financialTransaction.findUniqueOrThrow({ where: { id: ft.id } });
    expect(after.status).toBe("CANCELLED");
  });

  it("não deixa operador comum cancelar OS PAGA por este caminho (bypass de RBAC)", async () => {
    const order = await mkOrder("PAID");

    await expect(
      caller(mkCtx(operatorId, "operator")).serviceOrder.confirmPhysicalReturnTerm({ orderId: order.id }),
    ).rejects.toThrow();

    const after = await prisma.serviceOrder.findUniqueOrThrow({ where: { id: order.id } });
    expect(after.status).toBe("PAID"); // dinheiro recebido não vira cancelado sem estorno
  });
});
