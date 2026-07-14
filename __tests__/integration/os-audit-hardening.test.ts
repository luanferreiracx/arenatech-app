/**
 * Auditoria OS — PR A (endurecimento). Validação ao vivo contra Postgres local.
 * F1: updateCosts — admin corrige custo de OS finalizada (PAID/DELIVERED),
 *      operador não; CANCELLED/REFUNDED bloqueado p/ todos. F4: getQuoteByLink NÃO vaza costPrice.
 * F8: technicianReport restrito a admin/gerente (operador comum é barrado).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
vi.mock("@/server/auth", () => ({ auth: async () => null }));
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createCallerFactory } from "@/server/api/trpc";
import { appRouter } from "@/server/api/root";
import { withTenant } from "@/server/db";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const MARK = "os-audit-A";
let tenantId: string, adminId: string, operatorId: string;
let customerId: string;
const orderIds: string[] = [];
const quoteIds: string[] = [];

function mkCtx(userId: string, role: "admin" | "operator", isTechnician: boolean) {
  return {
    session: { user: { id: userId, isSuperAdmin: false }, activeTenantId: tenantId,
      availableTenants: [{ id: tenantId, slug: "arena-tech", role, isTechnician }] },
    tenantId, withTenant: (fn: any) => withTenant(tenantId, fn),
  } as any;
}
const caller = (ctx: any) => createCallerFactory(appRouter)(ctx);

beforeAll(async () => {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "arena-tech" } });
  const admin = await prisma.user.findFirstOrThrow({ where: { name: "Admin Arena" } });
  const operator = await prisma.user.findFirstOrThrow({ where: { name: "Operador Arena" } });
  tenantId = tenant.id; adminId = admin.id; operatorId = operator.id;
  customerId = (await prisma.customer.create({ data: { tenantId, name: `${MARK}-c`, phone: "11988887777" } })).id;
});

afterAll(async () => {
  await prisma.serviceOrderQuote.deleteMany({ where: { id: { in: quoteIds } } });
  await prisma.serviceOrder.deleteMany({ where: { id: { in: orderIds } } });
  await prisma.customer.deleteMany({ where: { id: customerId } });
  await prisma.$disconnect();
});

let seq = 0;
async function mkOrder(status: string) {
  seq += 1;
  const o = await prisma.serviceOrder.create({
    data: { tenantId, number: `${MARK}-${Date.now()}-${seq}`, customerId, createdById: adminId,
      status: status as any, publicLink: `${MARK}-pl-${Date.now()}-${seq}`, totalAmount: 200, serviceAmount: 200 },
  });
  orderIds.push(o.id);
  return o;
}

describe("Auditoria OS — PR A (F1/F4/F8)", () => {
  it("F1: updateCosts OK em OS aberta (IN_PROGRESS)", async () => {
    const order = await mkOrder("IN_PROGRESS");
    const r = await caller(mkCtx(adminId, "admin", false)).serviceOrder.updateCosts({ id: order.id, partsCost: 1500, otherCost: 200 });
    expect(r.success).toBe(true);
  });

  it("F1: admin PODE corrigir custos de OS finalizada (PAID)", async () => {
    const order = await mkOrder("PAID");
    const r = await caller(mkCtx(adminId, "admin", false)).serviceOrder.updateCosts({ id: order.id, partsCost: 1000, otherCost: 300 });
    expect(r.success).toBe(true);
    const updated = await prisma.serviceOrder.findUniqueOrThrow({ where: { id: order.id } });
    expect(Number(updated.partsCost)).toBe(10); // 1000 centavos → 10,00
    expect(Number(updated.otherCost)).toBe(3);
  });

  it("F1: admin PODE corrigir custos de OS entregue (DELIVERED)", async () => {
    const order = await mkOrder("DELIVERED");
    const r = await caller(mkCtx(adminId, "admin", false)).serviceOrder.updateCosts({ id: order.id, partsCost: 500, otherCost: 0 });
    expect(r.success).toBe(true);
  });

  it("F1: operador comum NÃO edita custos de OS finalizada (PAID)", async () => {
    const order = await mkOrder("PAID");
    await expect(
      caller(mkCtx(operatorId, "operator", false)).serviceOrder.updateCosts({ id: order.id, partsCost: 1000, otherCost: 0 }),
    ).rejects.toThrow(/administradores/i);
  });

  it("G-P1-09: operador comum NÃO edita custos de OS aberta (IN_PROGRESS)", async () => {
    // A3: custo é dado de admin. Antes o operador editava custo em OS aberta
    // (só PAID/DELIVERED barrava); agora é admin em qualquer status editável.
    const order = await mkOrder("IN_PROGRESS");
    await expect(
      caller(mkCtx(operatorId, "operator", false)).serviceOrder.updateCosts({ id: order.id, partsCost: 1000, otherCost: 0 }),
    ).rejects.toThrow(/administradores/i);
  });

  it("F1: nem admin edita custos de OS cancelada (CANCELLED)", async () => {
    const order = await mkOrder("CANCELLED");
    await expect(
      caller(mkCtx(adminId, "admin", false)).serviceOrder.updateCosts({ id: order.id, partsCost: 1000, otherCost: 0 }),
    ).rejects.toThrow(/cancelada ou estornada/i);
  });

  it("F1: nem admin edita custos de OS estornada (REFUNDED)", async () => {
    const order = await mkOrder("REFUNDED");
    await expect(
      caller(mkCtx(adminId, "admin", false)).serviceOrder.updateCosts({ id: order.id, partsCost: 1000, otherCost: 0 }),
    ).rejects.toThrow(/cancelada ou estornada/i);
  });

  it("F4: getQuoteByLink NÃO expõe costPrice nem IDs internos", async () => {
    const order = await mkOrder("WAITING_APPROVAL");
    const link = `${MARK}-alink-${Date.now()}`;
    const quote = await prisma.serviceOrderQuote.create({
      data: {
        tenantId, orderId: order.id, userId: adminId, reason: "teste F4", approvalLink: link, status: "pending",
        newItemsSnapshot: [
          { type: "PRODUCT", serviceId: null, productId: "prod-secreto", variationId: null,
            description: "Tela X", quantity: 1, unitPrice: 20000, costPrice: 8000, total: 20000 },
        ] as any,
      },
    });
    quoteIds.push(quote.id);

    const res: any = await caller(mkCtx(adminId, "admin", false)).serviceOrder.getQuoteByLink({ link });
    const snap = res.newItemsSnapshot;
    expect(Array.isArray(snap)).toBe(true);
    const item = snap[0];
    // Cliente vê descrição/preço, NUNCA custo nem IDs internos.
    expect(item.description).toBe("Tela X");
    expect(item.total).toBe(20000);
    expect(item.costPrice).toBeUndefined();
    expect(item.productId).toBeUndefined();
    expect(item.serviceId).toBeUndefined();
  });

  it("F8: technicianReport barra operador comum (não-admin, não-técnico)", async () => {
    await expect(
      caller(mkCtx(operatorId, "operator", false)).serviceOrder.technicianReport({}),
    ).rejects.toThrow(/restrito/i);
  });

  it("F8: technicianReport OK para admin", async () => {
    const r = await caller(mkCtx(adminId, "admin", false)).serviceOrder.technicianReport({});
    expect(r).toHaveProperty("items");
  });
});
