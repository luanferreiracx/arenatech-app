import type { Prisma } from "@prisma/client";

/**
 * Resolve o `categoryId` de uma transação financeira a partir do NOME da categoria
 * (a UI/`FinancialCategorySelect` armazena o nome, não a FK). Faz apenas LOOKUP —
 * NÃO cria categoria. A criação continua atrás do `createCategory` (admin-gated);
 * criar aqui deixaria um operador criar categoria por texto livre num RECEIVABLE,
 * furando o gate. O texto (`category`) segue como coluna-sombra.
 *
 * Casa por nome normalizado (lower+unaccent+trim) DENTRO do tipo correspondente
 * ao tipo da transação (PAYABLE→DESPESA, RECEIVABLE→RECEITA). Retorna o id da
 * categoria ativa mais antiga que casar, ou `null` (texto legado sem categoria
 * cadastrada continua válido, só não linka).
 *
 * `tx` já scoped ao tenant (withTenant).
 */
/**
 * Garante que a categoria FIXA de compra de aparelho exista no tenant e devolve
 * o id.
 *
 * Diferente de `resolveCategoryId`, esta função CRIA quando falta — e isso é
 * seguro justamente porque o nome/código são fixos e definidos no código, não
 * texto livre do usuário (o gate de admin do `createCategory` continua valendo
 * para categorias customizadas).
 *
 * Existe porque depender do seed/migration não basta: a migration faz backfill
 * dos tenants existentes, mas um tenant criado depois — ou um banco montado do
 * zero pelo `prisma/seed.ts`, que não chama `tenantFinancialInit` — ficaria sem
 * a categoria, e a compra voltaria a nascer sem `category_id`. Auditoria de
 * estoque 2026-08-04, P1-3.
 */
export async function ensureDevicePurchaseCategoryId(
  tx: Prisma.TransactionClient,
  tenantId: string,
): Promise<string> {
  const existing = await resolveCategoryId(tx, tenantId, DEVICE_PURCHASE_CATEGORY_NAME, "PAYABLE")
  if (existing) return existing

  // `upsert` pela unique (tenant_id, code): duas compras concorrentes no
  // primeiro uso do tenant não estouram a constraint.
  const created = await tx.financialCategory.upsert({
    where: { tenantId_code: { tenantId, code: DEVICE_PURCHASE_CATEGORY_CODE } },
    create: {
      tenantId,
      name: DEVICE_PURCHASE_CATEGORY_NAME,
      code: DEVICE_PURCHASE_CATEGORY_CODE,
      type: "DESPESA",
      kind: "FIXED",
      active: true,
    },
    update: {},
    select: { id: true },
  })
  return created.id
}

/** Categoria fixa da compra de aparelho — espelha `FIXED_CATEGORIES`. */
export const DEVICE_PURCHASE_CATEGORY_NAME = "Compra de aparelho"
export const DEVICE_PURCHASE_CATEGORY_CODE = "COMPRA_APARELHO"

export async function resolveCategoryId(
  tx: Prisma.TransactionClient,
  tenantId: string,
  categoryName: string | null | undefined,
  transactionType: "PAYABLE" | "RECEIVABLE",
): Promise<string | null> {
  const name = (categoryName ?? "").trim();
  if (!name) return null;

  const categoryType = transactionType === "RECEIVABLE" ? "RECEITA" : "DESPESA";

  const matches = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM financial_categories
    WHERE tenant_id = ${tenantId}::uuid
      AND active = true
      AND type::text = ${categoryType}
      AND lower(unaccent(btrim(name))) = lower(unaccent(btrim(${name})))
    ORDER BY created_at ASC
    LIMIT 1
  `;
  return matches[0]?.id ?? null;
}
