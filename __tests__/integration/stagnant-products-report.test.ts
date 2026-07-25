/**
 * C7 — relatório de produtos parados (stagnantProductsReport): produto em estoque
 * sem venda concluída há N dias aparece; com venda recente não; sem estoque não.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
vi.mock("@/server/auth", () => ({ auth: async () => null }));
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createCallerFactory } from "@/server/api/trpc";
import { appRouter } from "@/server/api/root";
import { withTenant } from "@/server/db";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const MARK = `stagnant-${Date.now().toString(36)}`;
let tenantId: string, adminId: string, adminCtx: any;
const productIds: string[] = [];
const saleIds: string[] = [];
const call = (c: any) => createCallerFactory(appRouter)(c);

beforeAll(async () => {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "arena-tech" } });
  const admin = await prisma.user.findFirstOrThrow({ where: { name: "Admin Arena" } });
  tenantId = tenant.id;
  adminId = admin.id;
  adminCtx = {
    session: { user: { id: adminId, isSuperAdmin: false }, activeTenantId: tenantId, availableTenants: [{ id: tenantId, slug: "arena-tech", role: "admin" }] },
    tenantId,
    withTenant: (fn: any) => withTenant(tenantId, fn),
  };
});

afterAll(async () => {
  await prisma.saleItem.deleteMany({ where: { productId: { in: productIds } } });
  await prisma.sale.deleteMany({ where: { id: { in: saleIds } } });
  await prisma.product.deleteMany({ where: { id: { in: productIds } } });
  await prisma.$disconnect();
});

async function makeProduct(name: string, stock: number, costReais: number) {
  const p = await prisma.product.create({
    data: { tenantId, name: `${MARK}-${name}`, costPrice: costReais, salePrice: costReais * 2, currentStock: stock, active: true },
  });
  productIds.push(p.id);
  return p;
}

async function makeSaleFor(productId: string, daysAgo: number) {
  const saleDate = new Date(Date.now() - daysAgo * 86400000);
  const sale = await prisma.sale.create({
    data: {
      tenantId,
      number: `${MARK}-${Math.random().toString(36).slice(2, 8)}`,
      sellerId: adminId,
      publicLink: `${MARK}-${Math.random().toString(36).slice(2)}`,
      status: "COMPLETED",
      saleDate,
    },
  });
  saleIds.push(sale.id);
  await prisma.saleItem.create({
    data: { tenantId, saleId: sale.id, productId, description: "item", unitPrice: 100, total: 100, quantity: 1 },
  });
}

describe("C7 — stagnantProductsReport", () => {
  it("classifica parados corretamente (nunca vendido, venda antiga, venda recente, sem estoque)", async () => {
    const never = await makeProduct("never", 5, 100); // parado: nunca vendido
    const old = await makeProduct("old", 5, 100); // parado: venda há 90d
    const recent = await makeProduct("recent", 5, 100); // NÃO: venda há 10d
    const noStock = await makeProduct("nostock", 0, 100); // NÃO: sem estoque

    await makeSaleFor(old.id, 90);
    await makeSaleFor(recent.id, 10);

    const res = await call(adminCtx).stock.stagnantProductsReport({ days: 60 });
    const ids = new Set(res.rows.map((r: any) => r.id));

    expect(ids.has(never.id)).toBe(true);
    expect(ids.has(old.id)).toBe(true);
    expect(ids.has(recent.id)).toBe(false); // vendeu dentro do corte
    expect(ids.has(noStock.id)).toBe(false); // sem estoque

    // Admin vê capital imobilizado (5 × R$100 = R$500 = 50000 centavos).
    const neverRow = res.rows.find((r: any) => r.id === never.id);
    expect(neverRow).toBeDefined();
    expect(neverRow!.immobilizedValueCents).toBe(50000);
    expect(neverRow!.lastSaleAt).toBeNull();
  });
});
