/**
 * O nome do produto gravado NA VENDA também sai em caixa alta.
 *
 * O item de venda guarda um snapshot do nome (`sale_items.description`) — é ele
 * que alimenta o cupom, o detalhe da venda e os relatórios "Vendas por produto"
 * e "Curva ABC". Depois que o catálogo virou caixa alta (2026-08-01), o produto
 * com variação ainda saía metade-metade aqui ("PELÍCULA HIDROGEL - Acabamento:
 * Fosco"), porque só o nome vinha do catálogo e os atributos eram concatenados
 * crus. O dono viu isso no relatório de vendas.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
vi.mock("@/server/auth", () => ({ auth: async () => null }));
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createCallerFactory } from "@/server/api/trpc";
import { appRouter } from "@/server/api/root";
import { withTenant } from "@/server/db";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

const MARK = `venda-caixa-${Date.now().toString(36)}`;
/* eslint-disable @typescript-eslint/no-explicit-any */
let tenantId: string;
let ctx: any;
let simpleProductId: string;
let variationProductId: string;
let variationId: string;
const saleIds: string[] = [];

const call = () => createCallerFactory(appRouter)(ctx);

beforeAll(async () => {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "arena-tech" } });
  const operator = await prisma.user.findFirstOrThrow({ where: { name: "Operador Arena" } });
  tenantId = tenant.id;
  ctx = {
    session: {
      user: { id: operator.id, isSuperAdmin: false },
      activeTenantId: tenantId,
      availableTenants: [{ id: tenantId, slug: "arena-tech", role: "operator" }],
    },
    tenantId,
    withTenant: (fn: any) => withTenant(tenantId, fn),
  };

  const simple = await prisma.product.create({
    data: {
      tenantId,
      name: `PRODUTO SIMPLES ${MARK.toUpperCase()}`,
      salePrice: 50,
      costPrice: 20,
      currentStock: 10,
    },
  });
  simpleProductId = simple.id;

  // Produto com variação: é onde o rótulo saía metade-metade.
  const parent = await prisma.product.create({
    data: {
      tenantId,
      name: `PELÍCULA HIDROGEL ${MARK.toUpperCase()}`,
      salePrice: 30,
      costPrice: 10,
      hasVariations: true,
    },
  });
  variationProductId = parent.id;

  const attribute = await prisma.productAttribute.create({
    data: { tenantId, name: "Acabamento", slug: `acabamento-${MARK}` },
  });
  const attributeValue = await prisma.productAttributeValue.create({
    data: { tenantId, attributeId: attribute.id, value: "Fosco" },
  });
  const variation = await prisma.productVariation.create({
    data: { tenantId, productId: parent.id, salePrice: 30, costPrice: 10, currentStock: 5 },
  });
  variationId = variation.id;
  await prisma.productVariationAttribute.create({
    data: { variationId: variation.id, attributeValueId: attributeValue.id },
  });
});

afterAll(async () => {
  await prisma.saleItem.deleteMany({ where: { saleId: { in: saleIds } } });
  await prisma.sale.deleteMany({ where: { id: { in: saleIds } } });
  await prisma.productVariationAttribute.deleteMany({ where: { variationId } });
  await prisma.productVariation.deleteMany({ where: { productId: variationProductId } });
  await prisma.productAttributeValue.deleteMany({ where: { attribute: { slug: `acabamento-${MARK}` } } });
  await prisma.productAttribute.deleteMany({ where: { slug: `acabamento-${MARK}` } });
  await prisma.stockMovement.deleteMany({ where: { productId: { in: [simpleProductId, variationProductId] } } });
  await prisma.product.deleteMany({ where: { id: { in: [simpleProductId, variationProductId] } } });
  await prisma.$disconnect();
});

async function novoCarrinho() {
  await call().sale.abandonDraft();
  const draft = await call().sale.createDraft();
  saleIds.push(draft.id);
  return draft.id;
}

describe("snapshot do nome do produto na venda", () => {
  it("produto simples entra no carrinho em caixa alta", async () => {
    const saleId = await novoCarrinho();
    await call().sale.addItem({ saleId, productId: simpleProductId, quantity: 1, unitPrice: 5000 });

    const item = await prisma.saleItem.findFirstOrThrow({ where: { saleId } });
    expect(item.description).toBe(`PRODUTO SIMPLES ${MARK.toUpperCase()}`);
  });

  it("produto com variação sai TODO em caixa alta, atributos inclusive", async () => {
    const saleId = await novoCarrinho();
    await call().sale.addItem({
      saleId,
      productId: variationProductId,
      variationId,
      quantity: 1,
      unitPrice: 3000,
    });

    const item = await prisma.saleItem.findFirstOrThrow({ where: { saleId } });
    expect(item.description).toBe(`PELÍCULA HIDROGEL ${MARK.toUpperCase()} - ACABAMENTO: FOSCO`);
    // A regressão era exatamente esta: metade do rótulo em caixa alta.
    expect(item.description).not.toContain("Acabamento");
  });
});
