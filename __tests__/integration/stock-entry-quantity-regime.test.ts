/**
 * Auditoria 2026-07-25 — `stock.entryQuantity` sem guard de REGIME de estoque.
 *
 * O sistema tem 3 regimes (resolveCurrentStockByProduct):
 *   serializado    → estoque = COUNT(StockItem AVAILABLE)
 *   com variações  → estoque = SUM(ProductVariation.currentStock)
 *   simples        → product.currentStock
 *
 * `stockEntry`, `stockEntryBatch`, `stockExit`, `adjustStock` e `adjustInventory`
 * rejeitam produto serializado e exigem `variationId` quando há variações.
 * `entryQuantity` (stock.ts:4450) é a única que não checa nada: escreve direto em
 * `product.currentStock` via `applyNonSerializedEntry`.
 *
 * Resultado: saldo FANTASMA — gravado no banco e no kardex, invisível em toda a
 * UI (que lê o saldo derivado). No produto com variações ainda sobrescreve o
 * `costPrice` do pai com uma média ponderada calculada sobre um saldo que não é
 * o real, corrompendo o CMV.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
vi.mock("@/server/auth", () => ({ auth: async () => null }));
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createCallerFactory } from "@/server/api/trpc";
import { appRouter } from "@/server/api/root";
import { withTenant } from "@/server/db";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const MARK = "entry-qty-regime";
let ctx: any, tenantId: string, adminId: string;
let serializedId: string, withVariationsId: string, variationId: string;

const caller = () => createCallerFactory(appRouter)(ctx);

beforeAll(async () => {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "arena-tech" } });
  const admin = await prisma.user.findFirstOrThrow({ where: { name: "Admin Arena" } });
  tenantId = tenant.id;
  adminId = admin.id;
  ctx = {
    session: { user: { id: adminId, isSuperAdmin: false }, activeTenantId: tenantId, availableTenants: [{ id: tenantId, slug: "arena-tech", role: "admin" }] },
    tenantId,
    withTenant: (fn: any) => withTenant(tenantId, fn),
  };

  serializedId = (await prisma.product.create({
    data: { tenantId, name: `${MARK}-serializado`, salePrice: 5000, costPrice: 4000, currentStock: 0, isSerialized: true, isDevice: true, active: true },
  })).id;

  const parent = await prisma.product.create({
    data: { tenantId, name: `${MARK}-com-variacoes`, salePrice: 100, costPrice: 50, currentStock: 0, hasVariations: true, active: true },
  });
  withVariationsId = parent.id;
  variationId = (await prisma.productVariation.create({
    data: { tenantId, productId: parent.id, sku: `${MARK}-sku-preto`, currentStock: 0, costPrice: 50, active: true },
  })).id;
});

afterAll(async () => {
  await prisma.stockMovement.deleteMany({ where: { productId: { in: [serializedId, withVariationsId] } } });
  await prisma.productVariation.deleteMany({ where: { id: variationId } });
  await prisma.product.deleteMany({ where: { id: { in: [serializedId, withVariationsId] } } });
  await prisma.$disconnect();
});

describe("stock.entryQuantity — precisa respeitar o regime de estoque", () => {
  it("rejeita entrada por quantidade em produto SERIALIZADO (hoje cria saldo fantasma)", async () => {
    await expect(
      caller().stock.entryQuantity({ productId: serializedId, quantity: 50, reason: "entrada indevida" }),
    ).rejects.toThrow();

    // O saldo real de serializado é COUNT(StockItem) = 0. currentStock não pode
    // ter sido inflado por baixo dos panos.
    const after = await prisma.product.findUniqueOrThrow({ where: { id: serializedId } });
    expect(after.currentStock).toBe(0);
  });

  it("rejeita entrada por quantidade em produto COM VARIAÇÕES (hoje incrementa o pai)", async () => {
    const costBefore = (await prisma.product.findUniqueOrThrow({ where: { id: withVariationsId } })).costPrice;

    await expect(
      caller().stock.entryQuantity({ productId: withVariationsId, quantity: 20, reason: "entrada indevida" }),
    ).rejects.toThrow();

    const after = await prisma.product.findUniqueOrThrow({ where: { id: withVariationsId } });
    expect(after.currentStock).toBe(0); // o saldo mora na variação
    expect(Number(after.costPrice)).toBe(Number(costBefore)); // custo do pai intacto

    const variation = await prisma.productVariation.findUniqueOrThrow({ where: { id: variationId } });
    expect(variation.currentStock).toBe(0);
  });
});
