/**
 * Backfill deduplicado da migração product_brand_entity (A1 da auditoria de cadastro).
 *
 * Prova que marcas iguais ignorando caixa/acento/espaço (Asus/ASUS, GENÉRICA/Generica,
 * "PEINING "/PEINING) mesclam numa ÚNICA ProductBrand, com a grafia canônica = mais
 * frequente, e que todos os produtos apontam pra ela. Roda a MESMA lógica SQL da
 * migração contra produtos sujos criados no teste.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const suffix = Date.now().toString(36);
let tenantId: string;
const productIds: string[] = [];
const brandIdsCreated: string[] = [];

// Marcas sujas: cada grupo deve colapsar em 1. A canônica é a MAIS FREQUENTE.
const dirty: Array<{ brand: string; count: number }> = [
  { brand: "Apple", count: 3 }, // canônica do grupo apple (3 > 1)
  { brand: "apple", count: 1 },
  { brand: "ASUS", count: 1 },
  { brand: "Asus", count: 2 }, // canônica (2 > 1)
  { brand: "GENÉRICA", count: 1 },
  { brand: "Generica", count: 4 }, // canônica (4 > 1, e unaccent iguala)
  { brand: "PEINING ", count: 2 }, // espaço à direita — btrim colapsa com "PEINING"
  { brand: "PEINING", count: 1 },
];

beforeAll(async () => {
  const t = await prisma.tenant.create({ data: { name: `Brand ${suffix}`, slug: `brand-${suffix}`, status: "ACTIVE" } });
  tenantId = t.id;
  for (const { brand, count } of dirty) {
    for (let i = 0; i < count; i++) {
      const p = await prisma.product.create({
        data: { tenantId, name: `${brand}-prod-${i}-${suffix}`, brand, salePrice: 10, costPrice: 5, currentStock: 1 },
      });
      productIds.push(p.id);
    }
  }
});

afterAll(async () => {
  await prisma.product.deleteMany({ where: { id: { in: productIds } } });
  await prisma.productBrand.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.$disconnect();
});

// Replica os passos 2a/2b da migração, escopado a este tenant.
async function runDedupBackfill() {
  await prisma.$executeRawUnsafe(
    `
    WITH normalized AS (
      SELECT p.tenant_id, p.brand AS raw, lower(unaccent(btrim(p.brand))) AS norm
      FROM products p
      WHERE p.tenant_id = $1::uuid AND p.brand IS NOT NULL AND btrim(p.brand) <> '' AND p.deleted_at IS NULL
    ),
    ranked AS (
      SELECT tenant_id, norm, btrim(raw) AS raw, count(*) AS freq,
        row_number() OVER (PARTITION BY tenant_id, norm ORDER BY count(*) DESC, length(btrim(raw)) ASC, btrim(raw) ASC) AS rn
      FROM normalized GROUP BY tenant_id, norm, btrim(raw)
    ),
    canonical AS (SELECT tenant_id, norm, raw AS canonical_name FROM ranked WHERE rn = 1)
    INSERT INTO product_brands (id, tenant_id, name, created_at, updated_at)
    SELECT gen_random_uuid(), tenant_id, canonical_name, now(), now() FROM canonical
  `,
    tenantId,
  );
  await prisma.$executeRawUnsafe(
    `
    UPDATE products p SET brand_id = b.id
    FROM product_brands b
    WHERE p.tenant_id = $1::uuid AND p.brand IS NOT NULL AND btrim(p.brand) <> ''
      AND b.tenant_id = p.tenant_id
      AND lower(unaccent(b.name)) = lower(unaccent(btrim(p.brand)))
  `,
    tenantId,
  );
}

describe("backfill dedup de marca", () => {
  it("mescla variantes de caixa/acento/espaço numa única marca canônica", async () => {
    await runDedupBackfill();

    const brands = await prisma.productBrand.findMany({ where: { tenantId }, select: { id: true, name: true } });
    brandIdsCreated.push(...brands.map((b) => b.id));
    const names = brands.map((b) => b.name).sort();

    // 4 grupos → 4 marcas, com as grafias canônicas (mais frequentes).
    // apple(Apple×3), asus(Asus×2), generica(Generica×4 — unaccent iguala GENÉRICA),
    // peining(PEINING — "PEINING "×2 colapsa por btrim; canônica sem espaço).
    expect(names).toEqual(["Apple", "Asus", "Generica", "PEINING"]);
  });

  it("todos os produtos apontam pra marca deduplicada (nenhum órfão)", async () => {
    const orphans = await prisma.product.count({
      where: { tenantId, brand: { not: null }, brandId: null },
    });
    expect(orphans).toBe(0);

    // O grupo "apple" (Apple×3 + apple×1) = 4 produtos, todos na mesma marca.
    const appleBrand = await prisma.productBrand.findFirstOrThrow({ where: { tenantId, name: "Apple" } });
    const appleProducts = await prisma.product.count({ where: { tenantId, brandId: appleBrand.id } });
    expect(appleProducts).toBe(4);
  });
});
