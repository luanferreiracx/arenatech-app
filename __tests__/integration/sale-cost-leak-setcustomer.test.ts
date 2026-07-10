/**
 * Auditoria PDV — validação ao vivo (getById/list/setCustomer reais).
 * A3: getById/list NÃO expõem costPrice dos itens para operador comum (só admin).
 * A5: setCustomer rejeita venda que não está em rascunho (pós-venda só via linkCustomer).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
vi.mock("@/server/auth", () => ({ auth: async () => null }));
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createCallerFactory } from "@/server/api/trpc";
import { appRouter } from "@/server/api/root";
import { withTenant } from "@/server/db";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const MARK = "pdv-cost-leak-test";
let tenantId: string, adminId: string, operatorId: string;
let adminCtx: any, operatorCtx: any;
let productId: string, saleId: string;

function mkCtx(userId: string) {
  return {
    session: { user: { id: userId, isSuperAdmin: false }, activeTenantId: tenantId, availableTenants: [{ id: tenantId, slug: "arena-tech", role: userId === adminId ? "admin" : "operator" }] },
    tenantId, withTenant: (fn: any) => withTenant(tenantId, fn),
  };
}

beforeAll(async () => {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "arena-tech" } });
  const admin = await prisma.user.findFirstOrThrow({ where: { name: "Admin Arena" } });
  const operator = await prisma.user.findFirstOrThrow({ where: { name: "Operador Arena" } });
  tenantId = tenant.id; adminId = admin.id; operatorId = operator.id;
  adminCtx = mkCtx(adminId); operatorCtx = mkCtx(operatorId);

  productId = (await prisma.product.create({
    data: { tenantId, name: `${MARK}-produto`, salePrice: 100, costPrice: 50, currentStock: 100, isDevice: false, isSerialized: false, hasVariations: false, active: true },
  })).id;
  // Venda COMPLETED com 1 item (costPrice 5000 cents = R$50).
  saleId = (await prisma.sale.create({
    data: {
      tenantId, number: `${MARK}-${Date.now()}`, sellerId: adminId,
      publicLink: `${MARK}-link-${Date.now()}`, status: "COMPLETED" as any,
      totalAmount: 100, paidAmount: 100,
      items: { create: [{ tenantId, productId, description: `${MARK}-item`, quantity: 1, unitPrice: 100, costPrice: 50, discount: 0, total: 100 }] },
    },
  })).id;
});

afterAll(async () => {
  await prisma.saleItem.deleteMany({ where: { saleId } });
  await prisma.sale.deleteMany({ where: { id: saleId } });
  await prisma.product.deleteMany({ where: { id: productId } });
  await prisma.$disconnect();
});

describe("Auditoria PDV — A3/A5 (ao vivo)", () => {
  it("A3: getById NÃO expõe costPrice para operador; expõe para admin", async () => {
    const adminSale = await createCallerFactory(appRouter)(adminCtx).sale.getById({ id: saleId });
    const opSale = await createCallerFactory(appRouter)(operatorCtx).sale.getById({ id: saleId });

    // Admin vê o custo; operador não.
    expect(adminSale.items[0]).toHaveProperty("costPrice");
    expect((adminSale.items[0] as any).costPrice).toBe(5000); // R$50 → centavos
    expect(opSale.items[0]).not.toHaveProperty("costPrice"); // ← o fix A3
  });

  it("A3: list NÃO expõe costPrice dos itens para operador", async () => {
    const opList = await createCallerFactory(appRouter)(operatorCtx).sale.list({ page: 0, pageSize: 100 });
    const row = opList.data.find((s: any) => s.id === saleId);
    expect(row).toBeDefined();
    for (const item of (row as any).items ?? []) {
      expect(item).not.toHaveProperty("costPrice");
    }
  });

  it("A5: setCustomer rejeita venda que não está em rascunho", async () => {
    await expect(
      createCallerFactory(appRouter)(adminCtx).sale.setCustomer({ saleId, customerName: "Fulano", customerId: null }),
    ).rejects.toThrow(/rascunho/i);
  });
});
