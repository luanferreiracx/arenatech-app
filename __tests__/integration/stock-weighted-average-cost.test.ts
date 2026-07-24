/**
 * A2/C3 — entrada de estoque valoriza o custo (custo médio ponderado móvel) e
 * grava o kardex valorizado no StockMovement.
 *
 * Bug: o `unitCost` digitado na tela de entrada era DESCARTADO pelo backend —
 * Product.costPrice nunca mudava e o movimento não guardava custo. Margem/DRE
 * descolavam a cada reposição. Aqui o custo entra na média ponderada e o
 * movimento passa a carregar unitCostCents/totalCostCents + quantityBefore/After.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
vi.mock("@/server/auth", () => ({ auth: async () => null }));
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createCallerFactory } from "@/server/api/trpc";
import { appRouter } from "@/server/api/root";
import { withTenant } from "@/server/db";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
let tenantId: string, adminId: string, adminCtx: any;
const productIds: string[] = [];

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
  await prisma.stockMovement.deleteMany({ where: { productId: { in: productIds } } });
  await prisma.product.deleteMany({ where: { id: { in: productIds } } });
  await prisma.$disconnect();
});

async function makeProduct(costReais: number, stock: number) {
  const p = await prisma.product.create({
    data: {
      tenantId,
      name: `wac-test-${Math.random().toString(36).slice(2, 8)}`,
      costPrice: costReais,
      salePrice: costReais * 2,
      currentStock: stock,
    },
  });
  productIds.push(p.id);
  return p;
}

describe("A2 — entrada valoriza custo médio ponderado + kardex", () => {
  it("10un@R$10 + entrada 10un@R$20 → custo R$15, movimento valorizado", async () => {
    const product = await makeProduct(10, 10);

    await call(adminCtx).stock.stockEntryBatch({
      items: [{ productId: product.id, quantity: 10, unitCost: 2000 }], // R$20,00
    });

    const after = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(after.currentStock).toBe(20);
    expect(Number(after.costPrice)).toBe(15); // média ponderada

    const mov = await prisma.stockMovement.findFirstOrThrow({
      where: { productId: product.id, type: "ENTRY" },
      orderBy: { createdAt: "desc" },
    });
    expect(mov.unitCostCents).toBe(2000);
    expect(mov.totalCostCents).toBe(20000);
    expect(mov.quantityBefore).toBe(10);
    expect(mov.quantityAfter).toBe(20);
  });

  it("entrada com custo 0 (não informado): NÃO mexe no custo do produto", async () => {
    const product = await makeProduct(12, 5);

    await call(adminCtx).stock.stockEntryBatch({
      items: [{ productId: product.id, quantity: 5, unitCost: 0 }],
    });

    const after = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(after.currentStock).toBe(10);
    expect(Number(after.costPrice)).toBe(12); // inalterado

    const mov = await prisma.stockMovement.findFirstOrThrow({
      where: { productId: product.id, type: "ENTRY" },
      orderBy: { createdAt: "desc" },
    });
    expect(mov.unitCostCents).toBeNull();
    expect(mov.totalCostCents).toBeNull();
  });

  it("produto sem custo (0) recebe o custo da primeira entrada", async () => {
    const product = await makeProduct(0, 0);

    await call(adminCtx).stock.stockEntryBatch({
      items: [{ productId: product.id, quantity: 3, unitCost: 5000 }], // R$50,00
    });

    const after = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(Number(after.costPrice)).toBe(50);
    expect(after.currentStock).toBe(3);
  });

  it("mesmo produto repetido no lote acumula a média corretamente", async () => {
    const product = await makeProduct(0, 0);

    await call(adminCtx).stock.stockEntryBatch({
      items: [
        { productId: product.id, quantity: 10, unitCost: 1000 }, // 10@R$10
        { productId: product.id, quantity: 10, unitCost: 2000 }, // +10@R$20 → R$15
      ],
    });

    const after = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(after.currentStock).toBe(20);
    expect(Number(after.costPrice)).toBe(15);
  });
});
