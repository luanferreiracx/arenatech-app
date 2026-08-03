/**
 * Estoque baixo resolvido no BANCO — paridade com o cálculo em memória.
 *
 * O painel carregava TODO produto com mínimo definido (sem `take`) e filtrava em
 * memória, duas vezes por carga. Com 935 produtos é irrelevante; uma loja com 20
 * mil carrega 40 mil linhas toda vez que alguém abre o painel.
 *
 * O risco de empurrar para SQL é sutil: o saldo efetivo vem de TRÊS fontes
 * conforme o tipo do produto (itens serializados, soma das variações, ou o
 * contador simples). Errar uma delas faz o alerta mentir — e mentir para menos,
 * escondendo produto em falta, é pior que não ter alerta.
 *
 * Estes testes montam os três tipos e comparam a resposta do SQL com a de
 * `resolveCurrentStockByProduct`, que é a regra que já estava em produção.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  countLowStockProducts,
  findLowStockProducts,
  resolveCurrentStockByProduct,
} from "@/server/services/stock-item.service";
import { withTenant } from "@/server/db";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const suffix = Date.now().toString(36);
let tenantId: string;
let categoryId: string;
const productIds: string[] = [];

/** Cria produto e devolve o id. `kind` escolhe a fonte do saldo. */
async function makeProduct(args: {
  name: string;
  minStock: number;
  kind: "simple" | "serialized" | "variations";
  stock: number;
}): Promise<string> {
  const product = await prisma.product.create({
    data: {
      tenantId,
      categoryId,
      name: `${args.name} ${suffix}`,
      minStock: args.minStock,
      active: true,
      isSerialized: args.kind === "serialized",
      hasVariations: args.kind === "variations",
      currentStock: args.kind === "simple" ? args.stock : 0,
      salePrice: 100,
      costPrice: 50,
    },
  });
  productIds.push(product.id);

  if (args.kind === "serialized") {
    for (let i = 0; i < args.stock; i++) {
      await prisma.stockItem.create({
        data: {
          tenantId,
          productId: product.id,
          serialNumber: `SN-${suffix}-${product.id.slice(0, 6)}-${i}`,
          status: "AVAILABLE",
          costPrice: 50,
        },
      });
    }
  }
  if (args.kind === "variations") {
    await prisma.productVariation.create({
      data: {
        tenantId,
        productId: product.id,
        sku: `SKU-${suffix}-${product.id.slice(0, 6)}`,
        currentStock: args.stock,
        active: true,
        salePrice: 100,
      },
    });
  }
  return product.id;
}

beforeAll(async () => {
  const tenant = await prisma.tenant.create({
    data: { name: `LowStock ${suffix}`, slug: `lowstock-${suffix}`, status: "ACTIVE" },
  });
  tenantId = tenant.id;
  const category = await prisma.productCategory.create({
    data: { tenantId, name: `Cat ${suffix}` },
  });
  categoryId = category.id;

  // Três tipos, cada um com um caso abaixo do mínimo e um acima.
  await makeProduct({ name: "simples-baixo", minStock: 5, kind: "simple", stock: 2 });
  await makeProduct({ name: "simples-cheio", minStock: 5, kind: "simple", stock: 50 });
  await makeProduct({ name: "serie-baixo", minStock: 3, kind: "serialized", stock: 1 });
  await makeProduct({ name: "serie-cheio", minStock: 1, kind: "serialized", stock: 4 });
  await makeProduct({ name: "variacao-baixo", minStock: 10, kind: "variations", stock: 2 });
  await makeProduct({ name: "variacao-cheio", minStock: 2, kind: "variations", stock: 30 });
  // Sem mínimo definido: nunca entra no alerta, mesmo zerado.
  await makeProduct({ name: "sem-minimo", minStock: 0, kind: "simple", stock: 0 });
});

afterAll(async () => {
  await prisma.stockItem.deleteMany({ where: { tenantId } });
  await prisma.productVariation.deleteMany({ where: { tenantId } });
  await prisma.product.deleteMany({ where: { tenantId } });
  await prisma.productCategory.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.$disconnect();
});

describe("estoque baixo no SQL", () => {
  it("conta os três tipos de produto abaixo do mínimo", async () => {
    const total = await withTenant(tenantId, (tx) => countLowStockProducts(tx));
    expect(total).toBe(3); // simples-baixo, serie-baixo, variacao-baixo
  });

  it("ignora produto sem mínimo definido, mesmo zerado", async () => {
    const rows = await withTenant(tenantId, (tx) => findLowStockProducts(tx, 50));
    expect(rows.some((r) => r.name.startsWith("sem-minimo"))).toBe(false);
  });

  it("traz os baixos e nenhum cheio", async () => {
    const rows = await withTenant(tenantId, (tx) => findLowStockProducts(tx, 50));
    const nomes = rows.map((r) => r.name.split(" ")[0]);
    expect(nomes).toContain("simples-baixo");
    expect(nomes).toContain("serie-baixo");
    expect(nomes).toContain("variacao-baixo");
    expect(nomes).not.toContain("simples-cheio");
    expect(nomes).not.toContain("serie-cheio");
    expect(nomes).not.toContain("variacao-cheio");
  });

  it("o saldo do SQL bate com o do cálculo em memória, nos três tipos", async () => {
    // A paridade é o ponto: `resolveCurrentStockByProduct` é a regra que já
    // rodava em produção. Se o SQL divergir dela, o alerta passa a mentir.
    const { sql, memoria } = await withTenant(tenantId, async (tx) => {
      const rows = await findLowStockProducts(tx, 50);
      const produtos = await tx.product.findMany({
        where: { id: { in: rows.map((r) => r.id) } },
        select: { id: true, currentStock: true, isSerialized: true, hasVariations: true },
      });
      return { sql: rows, memoria: await resolveCurrentStockByProduct(tx, produtos) };
    });

    expect(sql.length).toBeGreaterThan(0);
    for (const row of sql) {
      expect(row.effectiveStock).toBe(memoria.get(row.id));
    }
  });

  it("ordena do mais crítico e respeita o limite", async () => {
    const rows = await withTenant(tenantId, (tx) => findLowStockProducts(tx, 2));
    expect(rows).toHaveLength(2);
    expect(rows[0]!.effectiveStock).toBeLessThanOrEqual(rows[1]!.effectiveStock);
  });

  it("o RLS isola: outro tenant não vê estes produtos", async () => {
    const outro = await prisma.tenant.create({
      data: { name: `Outro ${suffix}`, slug: `outro-lowstock-${suffix}`, status: "ACTIVE" },
    });
    try {
      const total = await withTenant(outro.id, (tx) => countLowStockProducts(tx));
      expect(total).toBe(0);
    } finally {
      await prisma.tenant.deleteMany({ where: { id: outro.id } });
    }
  });
});
