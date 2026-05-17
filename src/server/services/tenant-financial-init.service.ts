import type { PrismaClient } from "@prisma/client"

const FIXED_CATEGORIES = [
  { code: "VENDAS", name: "Vendas", type: "RECEITA" as const },
  { code: "SERVICOS", name: "Serviços", type: "RECEITA" as const },
  { code: "OUTRAS_RECEITAS", name: "Outras Receitas", type: "RECEITA" as const },
  { code: "ALUGUEL", name: "Aluguel", type: "DESPESA" as const },
  { code: "FOLHA_PAGAMENTO", name: "Folha de Pagamento", type: "DESPESA" as const },
  { code: "FORNECEDORES", name: "Fornecedores", type: "DESPESA" as const },
  { code: "MANUTENCAO", name: "Manutenção", type: "DESPESA" as const },
  { code: "OUTRAS_DESPESAS", name: "Outras Despesas", type: "DESPESA" as const },
] as const

/**
 * Seeds the 8 FIXED financial categories for a new tenant.
 * Idempotent: running 2x does not duplicate (uses upsert by tenantId+code unique).
 * Called during tenant creation (ADR 0034).
 */
export async function tenantFinancialInit(
  tx: PrismaClient,
  tenantId: string
): Promise<void> {
  for (const cat of FIXED_CATEGORIES) {
    await tx.financialCategory.upsert({
      where: {
        tenantId_code: { tenantId, code: cat.code },
      },
      create: {
        tenantId,
        name: cat.name,
        code: cat.code,
        type: cat.type,
        kind: "FIXED",
        active: true,
      },
      update: {}, // no-op if already exists
    })
  }
}

export { FIXED_CATEGORIES }
