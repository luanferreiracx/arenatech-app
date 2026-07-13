import type { Prisma } from "@prisma/client";

/**
 * Resolve o `supplierId` de uma transação financeira a partir das entradas do
 * formulário, na ordem: fornecedor selecionado (supplierId) → criar novo
 * (newSupplierName) → texto legado (supplier). Cria o Supplier sob demanda
 * (find-or-create) deduplicando por nome normalizado (case/acento/espaço), igual
 * ao playbook da marca (product-brand.service).
 *
 * `tx` já scoped ao tenant (withTenant). Retorna `{ supplierId, supplierName }` —
 * `supplierName` alimenta a coluna-sombra `supplier` (busca/exibição legada).
 */
export async function resolveSupplierId(
  tx: Prisma.TransactionClient,
  tenantId: string,
  input: { supplierId?: string | null; newSupplierName?: string | null; supplier?: string | null },
): Promise<{ supplierId: string | null; supplierName: string | null }> {
  if (input.supplierId) {
    const existing = await tx.supplier.findFirst({
      where: { id: input.supplierId, deletedAt: null },
      select: { id: true, name: true },
    });
    if (existing) return { supplierId: existing.id, supplierName: existing.name };
  }

  const rawName = (input.newSupplierName ?? input.supplier ?? "").trim();
  if (!rawName) return { supplierId: null, supplierName: null };

  return findOrCreateSupplierByName(tx, tenantId, rawName);
}

/**
 * Find-or-create de fornecedor por nome, deduplicando por nome normalizado
 * (lower+unaccent+trim) — mesma normalização do backfill. Cria como PJ com a
 * grafia exata digitada (demais campos preenchíveis depois na tela de fornecedores).
 */
export async function findOrCreateSupplierByName(
  tx: Prisma.TransactionClient,
  tenantId: string,
  rawName: string,
): Promise<{ supplierId: string; supplierName: string }> {
  const name = rawName.trim();

  const matches = await tx.$queryRaw<Array<{ id: string; name: string }>>`
    SELECT id, name FROM suppliers
    WHERE tenant_id = ${tenantId}::uuid
      AND deleted_at IS NULL
      AND lower(unaccent(btrim(name))) = lower(unaccent(btrim(${name})))
    ORDER BY created_at ASC
    LIMIT 1
  `;
  if (matches[0]) return { supplierId: matches[0].id, supplierName: matches[0].name };

  const created = await tx.supplier.create({
    data: { tenantId, type: "PJ", name },
    select: { id: true, name: true },
  });
  return { supplierId: created.id, supplierName: created.name };
}
