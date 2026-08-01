import type { Prisma } from "@prisma/client";
import { normalizeSearchTerm } from "@/lib/search/normalize";

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
 * Marca existente cujo nome normalizado (minúsculo, sem acento, espaços
 * colapsados) bate com `rawName` — é assim que "Asus", "ASUS" e "Ásus" viram a
 * mesma marca. A coluna `search_name` é mantida por trigger no banco; o termo
 * passa pelo par TypeScript da mesma normalização.
 *
 * `excludeId` serve à renomeação: ao editar a marca X, ela não conta como
 * duplicata de si mesma.
 */
export async function findBrandByName(
  tx: Prisma.TransactionClient,
  rawName: string,
  excludeId?: string,
): Promise<{ id: string; name: string } | null> {
  const searchName = normalizeSearchTerm(rawName);
  if (!searchName) return null;

  return tx.productBrand.findFirst({
    where: {
      searchName,
      deletedAt: null,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });
}

/**
 * Find-or-create de marca por nome, deduplicando por nome normalizado.
 * Cria com a grafia exata que o usuário digitou.
 */
export async function findOrCreateBrandByName(
  tx: Prisma.TransactionClient,
  tenantId: string,
  rawName: string,
): Promise<{ brandId: string; brandName: string }> {
  const name = rawName.trim();

  const existing = await findBrandByName(tx, name);
  if (existing) return { brandId: existing.id, brandName: existing.name };

  const created = await tx.productBrand.create({
    data: { tenantId, name },
    select: { id: true, name: true },
  });
  return { brandId: created.id, brandName: created.name };
}
