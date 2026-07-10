/**
 * Auditoria Produtos/Estoque — I4 (ao vivo): cancelPurchase de compra serial-only
 * (imei nulo) reverte a unidade CERTA (casa por serial), não uma qualquer sem imei.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
vi.mock("@/server/auth", () => ({ auth: async () => null }));
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createCallerFactory } from "@/server/api/trpc";
import { appRouter } from "@/server/api/root";
import { withTenant } from "@/server/db";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const MARK = "i4-serial-test";
let ctx: any, tenantId: string, adminId: string, productId: string;
const purchaseIds: string[] = [];
const stockItemIds: string[] = [];

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
  await prisma.stockMovement.deleteMany({ where: { productId } });
  await prisma.stockItem.deleteMany({ where: { productId } });
  await prisma.devicePurchase.deleteMany({ where: { id: { in: purchaseIds } } });
  await prisma.product.deleteMany({ where: { id: productId } });
  await prisma.$disconnect();
});

describe("Auditoria Estoque — I4 (ao vivo): cancel serial-only casa a unidade certa", () => {
  it("cancela a compra da série A → reverte o item da série A, não o da B", async () => {
    // Duas compras serial-only (imei nulo) do MESMO produto, séries diferentes.
    const pA = await prisma.devicePurchase.create({ data: { tenantId, productId, purchasePrice: 600, imei: null, serial: `${MARK}-SA` } });
    const pB = await prisma.devicePurchase.create({ data: { tenantId, productId, purchasePrice: 600, imei: null, serial: `${MARK}-SB` } });
    purchaseIds.push(pA.id, pB.id);
    // Dois StockItems AVAILABLE, um por série (imei nulo).
    const iA = await prisma.stockItem.create({ data: { tenantId, productId, imei: null, serialNumber: `${MARK}-SA`, status: "AVAILABLE", condition: "USED", costPrice: 6 } });
    const iB = await prisma.stockItem.create({ data: { tenantId, productId, imei: null, serialNumber: `${MARK}-SB`, status: "AVAILABLE", condition: "USED", costPrice: 6 } });
    stockItemIds.push(iA.id, iB.id);

    await call().stock.cancelPurchase({ id: pA.id, reason: "teste I4 serial-only" });

    // O item da série A foi soft-deletado; o da série B segue AVAILABLE.
    const afterA = await prisma.stockItem.findUniqueOrThrow({ where: { id: iA.id } });
    const afterB = await prisma.stockItem.findUniqueOrThrow({ where: { id: iB.id } });
    expect(afterA.deletedAt).not.toBeNull(); // ← o fix I4: casou por série A
    expect(afterB.deletedAt).toBeNull();     // B intacto
  });
});
