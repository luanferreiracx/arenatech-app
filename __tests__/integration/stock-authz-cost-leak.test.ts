/**
 * Auditoria Produtos/Estoque — authz (ao vivo).
 * A1: operador NÃO importa catálogo via CSV (admin-only).
 * A3: operador NÃO vê costPrice em list/getById; admin vê.
 * A4: não excluir atributo em uso por variação viva.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
vi.mock("@/server/auth", () => ({ auth: async () => null }));
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createCallerFactory } from "@/server/api/trpc";
import { appRouter } from "@/server/api/root";
import { withTenant } from "@/server/db";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const MARK = "stock-authz-test";
let tenantId: string, adminId: string, operatorId: string, adminCtx: any, operatorCtx: any;
let productId: string, attrId: string, attrValueId: string, variationId: string;

const call = (c: any) => createCallerFactory(appRouter)(c);
function mkCtx(userId: string, role: string) {
  return {
    session: { user: { id: userId, isSuperAdmin: false }, activeTenantId: tenantId, availableTenants: [{ id: tenantId, slug: "arena-tech", role }] },
    tenantId, withTenant: (fn: any) => withTenant(tenantId, fn),
  };
}

beforeAll(async () => {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "arena-tech" } });
  const admin = await prisma.user.findFirstOrThrow({ where: { name: "Admin Arena" } });
  const operator = await prisma.user.findFirstOrThrow({ where: { name: "Operador Arena" } });
  tenantId = tenant.id; adminId = admin.id; operatorId = operator.id;
  adminCtx = mkCtx(adminId, "admin"); operatorCtx = mkCtx(operatorId, "operator");

  productId = (await prisma.product.create({
    data: { tenantId, name: `${MARK}-produto`, salePrice: 100, costPrice: 60, currentStock: 10, isSerialized: false, hasVariations: false, active: true },
  })).id;
  // Atributo + valor + variação usando o valor (para A4).
  attrId = (await prisma.productAttribute.create({ data: { tenantId, name: `${MARK}-cor`, slug: `${MARK}-cor-${Date.now()}` } })).id;
  attrValueId = (await prisma.productAttributeValue.create({ data: { tenantId, attributeId: attrId, value: "Azul" } })).id;
  variationId = (await prisma.productVariation.create({
    data: { tenantId, productId, sku: `${MARK}-var`, currentStock: 5, active: true },
  })).id;
  await prisma.productVariationAttribute.create({ data: { variationId, attributeValueId: attrValueId } });
});

afterAll(async () => {
  await prisma.productVariationAttribute.deleteMany({ where: { variationId } });
  await prisma.productVariation.deleteMany({ where: { id: variationId } });
  await prisma.productAttributeValue.deleteMany({ where: { id: attrValueId } });
  await prisma.productAttribute.deleteMany({ where: { id: attrId } });
  await prisma.product.deleteMany({ where: { id: productId } });
  await prisma.$disconnect();
});

describe("Auditoria Estoque — authz (ao vivo)", () => {
  it("A1: operador NÃO importa catálogo via CSV", async () => {
    await expect(
      call(operatorCtx).stock.importCsv({ lines: [{ name: `${MARK}-hack`, salePrice: 10000 }] }),
    ).rejects.toThrow(/administradores|permiss/i);
  });

  it("A3: operador NÃO vê costPrice; admin vê", async () => {
    const opDetail = await call(operatorCtx).stock.getById({ id: productId });
    const adminDetail = await call(adminCtx).stock.getById({ id: productId });
    expect(opDetail).not.toHaveProperty("costPrice");
    expect(adminDetail).toHaveProperty("costPrice");

    const opList = await call(operatorCtx).stock.list({});
    const row = opList.data.find((p: any) => p.id === productId);
    expect(row).toBeDefined();
    expect(row).not.toHaveProperty("costPrice");
  });

  it("A4: não exclui atributo em uso por variação viva", async () => {
    await expect(
      call(adminCtx).stock.deleteAttribute({ id: attrId }),
    ).rejects.toThrow(/em uso/i);
    await expect(
      call(adminCtx).stock.deleteAttributeValue({ id: attrValueId }),
    ).rejects.toThrow(/em uso/i);
  });
});
