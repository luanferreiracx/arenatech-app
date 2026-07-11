/**
 * Auditoria Produtos/Estoque — I3/I5 (ao vivo).
 * I3: unique parcial de serial_number bloqueia dois itens vivos com o mesmo serial.
 * I5: cancelar compra paga À VISTA (FT PAID + WITHDRAWAL) cancela a FT e DEVOLVE
 *     o dinheiro ao caixa (DEPOSIT/INCOME) — antes o gasto ficava órfão.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
vi.mock("@/server/auth", () => ({ auth: async () => null }));
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createCallerFactory } from "@/server/api/trpc";
import { appRouter } from "@/server/api/root";
import { withTenant } from "@/server/db";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const MARK = "i3i5-test";
let ctx: any, tenantId: string, adminId: string, productId: string;
const cleanup = { purchases: [] as string[], stockItems: [] as string[], fts: [] as string[], sessions: [] as string[] };

const call = () => createCallerFactory(appRouter)(ctx);

beforeAll(async () => {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "arena-tech" } });
  const admin = await prisma.user.findFirstOrThrow({ where: { name: "Admin Arena" } });
  tenantId = tenant.id; adminId = admin.id;
  ctx = {
    session: { user: { id: adminId, isSuperAdmin: false }, activeTenantId: tenantId, availableTenants: [{ id: tenantId, slug: "arena-tech", role: "admin" }] },
    tenantId, withTenant: (fn: any) => withTenant(tenantId, fn),
  };
  productId = (await prisma.product.create({
    data: { tenantId, name: `${MARK}-produto`, salePrice: 1000, costPrice: 600, currentStock: 0, isSerialized: true, isDevice: true, hasVariations: false, active: true },
  })).id;
});

afterAll(async () => {
  for (const s of cleanup.sessions) await prisma.cashMovement.deleteMany({ where: { cashSessionId: s } });
  await prisma.cashSession.deleteMany({ where: { id: { in: cleanup.sessions } } });
  await prisma.installment.deleteMany({ where: { transactionId: { in: cleanup.fts } } });
  await prisma.financialTransaction.deleteMany({ where: { id: { in: cleanup.fts } } });
  await prisma.stockMovement.deleteMany({ where: { productId } });
  await prisma.stockItem.deleteMany({ where: { productId } });
  await prisma.devicePurchase.deleteMany({ where: { id: { in: cleanup.purchases } } });
  await prisma.product.deleteMany({ where: { id: productId } });
  await prisma.$disconnect();
});

describe("Auditoria Estoque — I3/I5 (ao vivo)", () => {
  it("I3: unique parcial bloqueia dois itens vivos com o mesmo serial", async () => {
    const s1 = await prisma.stockItem.create({ data: { tenantId, productId, serialNumber: `${MARK}-DUP`, status: "AVAILABLE", condition: "USED", costPrice: 6 } });
    cleanup.stockItems.push(s1.id);
    await expect(
      prisma.stockItem.create({ data: { tenantId, productId, serialNumber: `${MARK}-DUP`, status: "AVAILABLE", condition: "USED", costPrice: 6 } }),
    ).rejects.toThrow(); // viola stock_items_tenant_serial_unique

    // Soft-delete libera o serial (WHERE deleted_at IS NULL): pode recadastrar.
    await prisma.stockItem.update({ where: { id: s1.id }, data: { deletedAt: new Date() } });
    const s2 = await prisma.stockItem.create({ data: { tenantId, productId, serialNumber: `${MARK}-DUP`, status: "AVAILABLE", condition: "USED", costPrice: 6 } });
    cleanup.stockItems.push(s2.id);
    expect(s2.id).toBeTruthy();
  });

  it("I5: cancelar compra paga à vista cancela a FT PAID e devolve o dinheiro ao caixa", async () => {
    const session = await prisma.cashSession.create({ data: { tenantId, userId: adminId, initialBalance: 0 } });
    cleanup.sessions.push(session.id);
    const purchase = await prisma.devicePurchase.create({ data: { tenantId, productId, purchasePrice: 600, imei: null, serial: `${MARK}-i5` } });
    cleanup.purchases.push(purchase.id);
    // FT PAYABLE PAID + WITHDRAWAL de caixa (dinheiro), como o createPurchase "now" gera.
    const ft = await prisma.financialTransaction.create({
      data: { tenantId, type: "PAYABLE", status: "PAID", description: `${MARK}-compra`, totalAmount: 600, paidAmount: 600, dueDate: new Date(), paidAt: new Date(), referenceType: "device_purchase", referenceId: purchase.id, createdByUserId: adminId },
    });
    cleanup.fts.push(ft.id);
    await prisma.cashMovement.create({
      data: { tenantId, cashSessionId: session.id, type: "WITHDRAWAL", nature: "OUTCOME", amount: 600, paymentMethod: "dinheiro", description: `${MARK}-saida`, referenceType: "device_purchase", referenceId: purchase.id, createdByUserId: adminId },
    });

    await call().stock.cancelPurchase({ id: purchase.id, reason: "teste I5 estorno PAID" });

    // FT PAID virou CANCELLED.
    const ftAfter = await prisma.financialTransaction.findUniqueOrThrow({ where: { id: ft.id } });
    expect(ftAfter.status).toBe("CANCELLED");
    // Dinheiro devolvido ao caixa: DEPOSIT/INCOME de R$600 com o método original.
    const deposit = await prisma.cashMovement.findFirst({
      where: { referenceType: "device_purchase_cancel", referenceId: purchase.id, type: "DEPOSIT", nature: "INCOME" },
    });
    expect(deposit).not.toBeNull();
    expect(Number(deposit!.amount)).toBe(600);
    expect(deposit!.paymentMethod).toBe("dinheiro");
  });
});
