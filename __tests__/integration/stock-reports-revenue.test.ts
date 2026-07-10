/**
 * Auditoria Produtos/Estoque — relatórios (ao vivo, delta).
 * R3: reportsSummary usa receita de mercadoria (subtotal−desconto), NÃO
 *     totalAmount (líquido do trade-in). Delta numa venda com upgrade.
 * R1: reportVendasProduto inclui a receita RETIDA de vendas PARTIALLY_REFUNDED
 *     (itens estornados somam 0; retidos entram).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
vi.mock("@/server/auth", () => ({ auth: async () => null }));
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createCallerFactory } from "@/server/api/trpc";
import { appRouter } from "@/server/api/root";
import { withTenant } from "@/server/db";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const MARK = "stock-reports-test";
let ctx: any, tenantId: string, adminId: string, productId: string;
const saleIds: string[] = [];

const call = () => createCallerFactory(appRouter)(ctx);
function todayRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  return { dateFrom: from, dateTo: to };
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
    data: { tenantId, name: `${MARK}-produto`, salePrice: 1000, costPrice: 600, currentStock: 100, isSerialized: false, hasVariations: false, active: true },
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

describe("Auditoria Estoque — relatórios (ao vivo)", () => {
  it("R3: reportsSummary usa mercadoria (subtotal−desconto), não totalAmount do trade-in", async () => {
    const range = todayRange();
    const before = (await call().stock.reportsSummary(range)).vendas.valorTotal as number;

    // Venda COMPLETED: mercadoria R$1.000, trade-in R$700 → totalAmount R$300.
    const sale = await prisma.sale.create({
      data: {
        tenantId, number: `${MARK}-r3-${Date.now()}`, sellerId: adminId,
        publicLink: `${MARK}-r3link-${Date.now()}`, status: "COMPLETED" as any,
        saleDate: new Date(), subtotal: 1000, discountAmount: 0, totalAmount: 300, paidAmount: 300, isOSPayment: false,
        items: { create: [{ tenantId, productId, description: `${MARK}-item`, quantity: 1, unitPrice: 1000, costPrice: 600, discount: 0, total: 1000 }] },
        upgrades: { create: [{ tenantId, model: `${MARK}-trade`, appraisedValue: 700, abatedValue: 700 }] },
      },
    });
    saleIds.push(sale.id);

    const after = (await call().stock.reportsSummary(range)).vendas.valorTotal as number;
    // Delta = receita de mercadoria (100000 centavos), NÃO totalAmount (30000).
    expect(after - before).toBe(100000);
  });

  it("R1: reportVendasProduto inclui a receita retida de venda PARTIALLY_REFUNDED", async () => {
    const range = todayRange();
    const totalFor = async () => {
      const rep: any = await call().stock.reportVendasProduto(range);
      const row = (rep.products ?? rep.data ?? []).find((p: any) => p.id === productId);
      return row ? Number(row.total ?? row.totalAmount ?? 0) : 0;
    };
    const before = await totalFor();

    // Venda com 2 itens (R$1.000 cada). 1 item estornado (total zerado) →
    // PARTIALLY_REFUNDED. A receita retida (R$1.000 do item mantido) deve entrar.
    const sale = await prisma.sale.create({
      data: {
        tenantId, number: `${MARK}-r1-${Date.now()}`, sellerId: adminId,
        publicLink: `${MARK}-r1link-${Date.now()}`, status: "PARTIALLY_REFUNDED" as any,
        saleDate: new Date(), subtotal: 1000, discountAmount: 0, totalAmount: 1000, paidAmount: 1000, isOSPayment: false,
        items: {
          create: [
            { tenantId, productId, description: `${MARK}-mantido`, quantity: 1, unitPrice: 1000, costPrice: 600, discount: 0, total: 1000 },
            { tenantId, productId, description: `${MARK}-estornado`, quantity: 1, unitPrice: 1000, costPrice: 600, discount: 0, total: 0 },
          ],
        },
      },
    });
    saleIds.push(sale.id);

    const after = await totalFor();
    // Só o item retido (R$1.000 = 100000 centavos) entra; o estornado (total 0) não infla.
    expect(after - before).toBe(100000);
  });
});
