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

const DEFAULT_PAYMENT_METHODS: Array<{
  name: string
  type: "CASH" | "PIX" | "CREDIT_CARD" | "DEBIT_CARD" | "BANK_TRANSFER" | "STORE_CREDIT" | "OTHER"
  acceptsChange?: boolean
}> = [
  { name: "Dinheiro", type: "CASH", acceptsChange: true },
  { name: "PIX", type: "PIX" },
  { name: "DEPIX", type: "PIX" },
  { name: "Cartão de Crédito", type: "CREDIT_CARD" },
  { name: "Cartão de Débito", type: "DEBIT_CARD" },
  { name: "Crediário", type: "STORE_CREDIT" },
]

/**
 * Seeds FIXED financial categories + default payment methods for a new tenant.
 * Idempotent: running 2x does not duplicate (uses upsert by tenantId+code unique
 * for categories; for payment methods, checks by name uniqueness per tenant).
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

  // Seed default payment methods (skip if any already exists for this tenant)
  const existingCount = await tx.paymentMethod.count({ where: { tenantId } })
  if (existingCount === 0) {
    await tx.paymentMethod.createMany({
      data: DEFAULT_PAYMENT_METHODS.map((pm) => ({
        tenantId,
        name: pm.name,
        type: pm.type,
        feePercent: 0,
        active: true,
        acceptsChange: pm.acceptsChange ?? false,
      })),
    })
  }
}

export { FIXED_CATEGORIES, DEFAULT_PAYMENT_METHODS }
