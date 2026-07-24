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
