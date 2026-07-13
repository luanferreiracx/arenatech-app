import type { Prisma } from "@prisma/client";

/**
 * Resolve o `brandId` de um produto a partir das entradas do formulário/CSV,
 * na ordem: marca selecionada (brandId) → criar nova (newBrandName) → texto
 * legado (brand). Cria a marca sob demanda (find-or-create) deduplicando por
 * nome normalizado (case/acento/espaço-insensitive), espelhando o backfill.
 *
 * Recebe o `tx` já scoped ao tenant (withTenant). Retorna `{ brandId, brandName }`
 * — o `brandName` alimenta a coluna-sombra `Product.brand` durante a transição.
 */
export async function resolveBrandId(
  tx: Prisma.TransactionClient,
  tenantId: string,
  input: { brandId?: string | null; newBrandName?: string | null; brand?: string | null },
): Promise<{ brandId: string | null; brandName: string | null }> {
  // 1. Marca já selecionada (entidade existente).
  if (input.brandId) {
    const existing = await tx.productBrand.findFirst({
      where: { id: input.brandId, deletedAt: null },
      select: { id: true, name: true },
    });
    if (existing) return { brandId: existing.id, brandName: existing.name };
    // brandId inválido cai no fallback abaixo (não estoura).
  }

  // 2. Nome cru: da criação inline (newBrandName) ou do texto legado (brand).
  const rawName = (input.newBrandName ?? input.brand ?? "").trim();
  if (!rawName) return { brandId: null, brandName: null };

  return findOrCreateBrandByName(tx, tenantId, rawName);
}

/**
 * Find-or-create de marca por nome, deduplicando por nome normalizado
 * (lower+unaccent+trim). Usa a mesma normalização do backfill para não recriar
 * variantes ("Asus" vs "ASUS"). Cria com a grafia exata que o usuário digitou.
 */
export async function findOrCreateBrandByName(
  tx: Prisma.TransactionClient,
  tenantId: string,
  rawName: string,
): Promise<{ brandId: string; brandName: string }> {
  const name = rawName.trim();

  // Match por nome normalizado (case/acento/espaço) via SQL — o índice único
  // (@@unique tenantId,name) é exato, então a dedup canônica exige unaccent.
  const matches = await tx.$queryRaw<Array<{ id: string; name: string }>>`
    SELECT id, name FROM product_brands
    WHERE tenant_id = ${tenantId}::uuid
      AND deleted_at IS NULL
      AND lower(unaccent(btrim(name))) = lower(unaccent(btrim(${name})))
    ORDER BY created_at ASC
    LIMIT 1
  `;
  if (matches[0]) return { brandId: matches[0].id, brandName: matches[0].name };

  const created = await tx.productBrand.create({
    data: { tenantId, name },
    select: { id: true, name: true },
  });
  return { brandId: created.id, brandName: created.name };
}
