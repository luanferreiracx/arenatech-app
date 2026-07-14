/**
 * G-P1-07: applyDiscount tem que abater o trade-in do "A pagar" (totalAmount),
 * igual aos outros mutadores de carrinho (via recalculateSale).
 *
 * Decisão do dono (confirmada): "Total" (subtotal/mercadoria) = a soma de tudo,
 * sempre. "A pagar" (totalAmount) = subtotal − desconto − trade-in.
 *
 * Antes, applyDiscount escrevia totalAmount = subtotal − desconto (ignorando o
 * abatimento do trade-in) → cobrava a mais quando havia aparelho de entrada.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
vi.mock("@/server/auth", () => ({ auth: async () => null }));
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createCallerFactory } from "@/server/api/trpc";
import { appRouter } from "@/server/api/root";
import { withTenant } from "@/server/db";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const MARK = "sale-discount-tradein-test";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let ctx: any, tenantId: string, adminId: string, productId: string;
const saleIds: string[] = [];

function caller() {
  return createCallerFactory(appRouter)(ctx);
}

beforeAll(async () => {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "arena-tech" } });
  const admin = await prisma.user.findFirstOrThrow({ where: { name: "Admin Arena" } });
  tenantId = tenant.id;
  adminId = admin.id;
  ctx = {
    session: { user: { id: adminId, isSuperAdmin: false }, activeTenantId: tenantId, availableTenants: [{ id: tenantId, slug: "arena-tech", role: "admin" }] },
    tenantId,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    withTenant: (fn: any) => withTenant(tenantId, fn),
  };
  productId = (await prisma.product.create({
    data: { tenantId, name: `${MARK}-produto`, salePrice: 100, costPrice: 50, currentStock: 100, isDevice: false, isSerialized: false, hasVariations: false, active: true },
  })).id;
});

afterAll(async () => {
  for (const sid of saleIds) {
    await prisma.saleUpgrade.deleteMany({ where: { saleId: sid } });
    await prisma.saleItem.deleteMany({ where: { saleId: sid } });
    await prisma.sale.deleteMany({ where: { id: sid } });
  }
  await prisma.product.deleteMany({ where: { id: productId } });
  await prisma.$disconnect();
});

describe("applyDiscount com trade-in (G-P1-07)", () => {
  it("desconto após trade-in abate ambos do 'A pagar'; 'Total' (subtotal) fica cheio", async () => {
    const draft = await caller().sale.createDraft();
    saleIds.push(draft.id);

    // Item R$100 (o "Total"/mercadoria).
    await caller().sale.addItem({ saleId: draft.id, productId, quantity: 1, unitPrice: 10000 });
    // Trade-in (aparelho de entrada) que abate R$30 da venda.
    await caller().sale.addUpgrade({
      saleId: draft.id,
      model: "iPhone Teste",
      imei: "490154203237518", // Luhn válido
      condition: "USED",
      appraisedValue: 3000,
      abatedValue: 3000,
    });
    // Desconto de R$10.
    const afterDiscount = await caller().sale.applyDiscount({
      saleId: draft.id,
      discountType: "fixed",
      discountValue: 1000,
      discountReason: "teste",
    });

    // "Total" (subtotal/mercadoria) = soma de tudo, intacto.
    expect(afterDiscount.subtotal).toBe(10000);
    // "A pagar" (totalAmount) = 100 − 10 (desconto) − 30 (trade-in) = 60.
    expect(afterDiscount.totalAmount).toBe(6000);
    // Sem downgrade (líquido > 0), nada a devolver.
    expect(afterDiscount.refundDueAmount).toBe(0);
  });
});
