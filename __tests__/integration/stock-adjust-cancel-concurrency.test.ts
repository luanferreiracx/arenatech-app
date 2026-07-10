/**
 * Auditoria Produtos/Estoque — validação ao vivo (concorrência).
 * S1: dois adjustInventory concorrentes no mesmo produto simples serializam
 *     (lock FOR UPDATE) — o ledger encadeia (before do 2º == after do 1º),
 *     em vez de ambos gravarem o mesmo `before` stale (lost update do ledger).
 * I7: dois cancelPurchase concorrentes na mesma compra → um vence, um CONFLICT,
 *     e o estoque é decrementado UMA vez (não em dobro).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
vi.mock("@/server/auth", () => ({ auth: async () => null }));
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createCallerFactory } from "@/server/api/trpc";
import { appRouter } from "@/server/api/root";
import { withTenant } from "@/server/db";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const MARK = "stock-conc-test";
let ctx: any, tenantId: string, adminId: string;
const productIds: string[] = [];
const purchaseIds: string[] = [];

const call = () => createCallerFactory(appRouter)(ctx);

beforeAll(async () => {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "arena-tech" } });
  const admin = await prisma.user.findFirstOrThrow({ where: { name: "Admin Arena" } });
  tenantId = tenant.id; adminId = admin.id;
  ctx = {
    session: { user: { id: adminId, isSuperAdmin: false }, activeTenantId: tenantId, availableTenants: [{ id: tenantId, slug: "arena-tech", role: "admin" }] },
    tenantId, withTenant: (fn: any) => withTenant(tenantId, fn),
  };
});

afterAll(async () => {
  for (const p of productIds) {
    await prisma.stockMovement.deleteMany({ where: { productId: p } });
    await prisma.product.deleteMany({ where: { id: p } });
  }
  await prisma.devicePurchase.deleteMany({ where: { id: { in: purchaseIds } } });
  await prisma.$disconnect();
});

async function makeSimpleProduct(stock: number) {
  const p = await prisma.product.create({
    data: { tenantId, name: `${MARK}-${Date.now()}-${Math.round(stock)}`, salePrice: 100, costPrice: 50, currentStock: stock, isSerialized: false, hasVariations: false, active: true },
  });
  productIds.push(p.id);
  return p.id;
}

describe("Auditoria Estoque — concorrência (ao vivo)", () => {
  it("S1: dois ajustes concorrentes serializam e o ledger encadeia", async () => {
    const productId = await makeSimpleProduct(10);
    const c = call();

    // Ajusta para 12 e para 20 em paralelo. Com o lock FOR UPDATE, um lê o valor
    // do outro como `before`; sem o lock ambos gravariam before=10 (ledger quebrado).
    await Promise.allSettled([
      c.stock.adjustInventory({ productId, newQuantity: 12, reason: "ajuste concorrente A" }),
      c.stock.adjustInventory({ productId, newQuantity: 20, reason: "ajuste concorrente B" }),
    ]);

    const movements = await prisma.stockMovement.findMany({
      where: { productId, type: "ADJUSTMENT" },
      orderBy: { createdAt: "asc" },
      select: { quantityBefore: true, quantityAfter: true },
    });
    expect(movements.length).toBe(2);
    // O 2º movimento parte de onde o 1º terminou (encadeamento correto).
    expect(movements[1]!.quantityBefore).toBe(movements[0]!.quantityAfter);
    // Saldo final == quantityAfter do último movimento (ledger reconcilia).
    const prod = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
    expect(prod.currentStock).toBe(movements[1]!.quantityAfter);
  });

  it("I7: dois cancelamentos concorrentes → um vence, um CONFLICT, 1 decremento", async () => {
    const productId = await makeSimpleProduct(5);
    // Compra não-serializada que "gerou" 1 unidade (currentStock já reflete).
    const purchase = await prisma.devicePurchase.create({
      data: { tenantId, productId, purchasePrice: 100 },
    });
    purchaseIds.push(purchase.id);
    const c = call();

    const results = await Promise.allSettled([
      c.stock.cancelPurchase({ id: purchase.id, reason: "cancel concorrente A" }),
      c.stock.cancelPurchase({ id: purchase.id, reason: "cancel concorrente B" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);

    // Estoque decrementado UMA vez (5 → 4), não em dobro (3).
    const prod = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
    expect(prod.currentStock).toBe(4);
    const exits = await prisma.stockMovement.count({
      where: { productId, type: "EXIT", referenceId: purchase.id },
    });
    expect(exits).toBe(1);
  });
});
