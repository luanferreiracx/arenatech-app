/**
 * Auditoria Financeiro — D2 (ao vivo): a home (dashboard.getStats) reporta
 * faturamento com a MESMA definição do DRE — receita de mercadoria
 * (subtotal − desconto), NÃO totalAmount (líquido do trade-in). Antes as duas
 * telas mostravam faturamentos diferentes numa venda com aparelho de entrada.
 * Teste por DELTA (antes/depois) para ser determinístico no tenant compartilhado.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
vi.mock("@/server/auth", () => ({ auth: async () => null }));
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createCallerFactory } from "@/server/api/trpc";
import { appRouter } from "@/server/api/root";
import { withTenant } from "@/server/db";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const MARK = "d2-revenue-test";
let ctx: any, tenantId: string, adminId: string, saleId: string, productId: string;

function caller() { return createCallerFactory(appRouter)(ctx); }

beforeAll(async () => {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "arena-tech" } });
  const admin = await prisma.user.findFirstOrThrow({ where: { name: "Admin Arena" } });
  tenantId = tenant.id; adminId = admin.id;
  ctx = {
    session: { user: { id: adminId, isSuperAdmin: false }, activeTenantId: tenantId, availableTenants: [{ id: tenantId, slug: "arena-tech", role: "admin" }] },
    tenantId, withTenant: (fn: any) => withTenant(tenantId, fn),
  };
  productId = (await prisma.product.create({
    data: { tenantId, name: `${MARK}-produto`, salePrice: 1000, costPrice: 600, currentStock: 100, isDevice: false, isSerialized: false, hasVariations: false, active: true },
  })).id;
});

afterAll(async () => {
  if (saleId) {
    await prisma.saleUpgrade.deleteMany({ where: { saleId } });
    await prisma.saleItem.deleteMany({ where: { saleId } });
    await prisma.sale.deleteMany({ where: { id: saleId } });
  }
  await prisma.product.deleteMany({ where: { id: productId } });
  await prisma.$disconnect();
});

describe("Auditoria Financeiro — D2 (ao vivo)", () => {
  it("home usa receita de mercadoria (subtotal−desconto), não totalAmount do trade-in", async () => {
    const before = await caller().dashboard.stats();
    const beforeMonth = before.sales.monthTotal as number;

    // Venda COMPLETED com aparelho de entrada: mercadoria R$1.000, trade-in
    // R$700 → totalAmount (líquido) = R$300. sale_date = agora.
    const sale = await prisma.sale.create({
      data: {
        tenantId, number: `${MARK}-${Date.now()}`, sellerId: adminId,
        publicLink: `${MARK}-link-${Date.now()}`, status: "COMPLETED" as any,
        saleDate: new Date(), subtotal: 1000, discountAmount: 0, operatorFeeAmount: 0,
        totalAmount: 300, paidAmount: 300, isOSPayment: false,
        items: { create: [{ tenantId, productId, description: `${MARK}-item`, quantity: 1, unitPrice: 1000, costPrice: 600, discount: 0, total: 1000 }] },
        upgrades: { create: [{ tenantId, model: `${MARK}-trade`, appraisedValue: 700, abatedValue: 700 }] },
      },
    });
    saleId = sale.id;

    const after = await caller().dashboard.stats();
    const deltaMonth = (after.sales.monthTotal as number) - beforeMonth;

    // O delta deve ser a RECEITA DE MERCADORIA (100000 centavos = R$1.000),
    // NÃO o totalAmount líquido do trade-in (30000 = R$300).
    expect(deltaMonth).toBe(100000);
    expect(deltaMonth).not.toBe(30000);
  });
});
