import type { Prisma } from "@prisma/client"
import {
  DEFAULT_SIMULATOR_MAX_INSTALLMENTS,
  DEFAULT_SIMULATOR_CREDIT_AVISTA_FEE,
  DEFAULT_SIMULATOR_DEBIT_FEE,
  defaultSimulatorTiers,
} from "@/lib/simulator-defaults"

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

/** Catálogo padrão de bandeiras de cartão (editável pelo tenant). */
const DEFAULT_CARD_BRANDS = ["Visa", "Mastercard", "Elo", "Amex", "Hipercard"] as const

/**
 * Seeds FIXED financial categories + default payment methods for a new tenant.
 * Idempotent: running 2x does not duplicate (uses upsert by tenantId+code unique
 * for categories; for payment methods, checks by name uniqueness per tenant).
 * Called during tenant creation (ADR 0034).
 */
export async function tenantFinancialInit(
  tx: Prisma.TransactionClient,
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

  // Seed catálogo padrão de bandeiras de cartão (fundação de recebíveis).
  // Idempotente: só cria se o tenant ainda não tiver nenhuma bandeira.
  const existingBrands = await tx.cardBrand.count({ where: { tenantId } })
  if (existingBrands === 0) {
    await tx.cardBrand.createMany({
      data: DEFAULT_CARD_BRANDS.map((name) => ({ tenantId, name })),
    })
  }

  // Seed default simulator rate config (taxas exibidas ao cliente, com margem).
  // Idempotente: so cria se ainda nao existir.
  const existingSimConfig = await tx.simulatorRateConfig.findUnique({
    where: { tenantId },
  })
  if (!existingSimConfig) {
    await tx.simulatorRateConfig.create({
      data: {
        tenantId,
        creditAvistaFeePercent: DEFAULT_SIMULATOR_CREDIT_AVISTA_FEE,
        debitFeePercent: DEFAULT_SIMULATOR_DEBIT_FEE,
        maxInstallments: DEFAULT_SIMULATOR_MAX_INSTALLMENTS,
        tiers: {
          create: defaultSimulatorTiers().map((t) => ({
            tenantId,
            installments: t.installments,
            feePercent: t.feePercent,
          })),
        },
      },
    })
  }

  // Seed config de taxa DePix (entrada R$0,99+1,5% / saida R$0,99+1,7%).
  // Idempotente. So o seed LOCAL aqui — a carteira LWK nasce non-custodial no
  // 1o acesso do tenant (ADR 0051), via depixWallet.setupWallet.
  //
  // Tenant central (Arena Tech): seedado com taxa ZERO. Ele eh quem RECEBE
  // as taxas dos demais tenants; nao paga taxa pra si mesmo. O loadFeeConfig
  // do servico tambem aplica esse guard em runtime.
  const isCentralTenant = await isCentralTenantId(tx, tenantId)
  const existingFeeConfig = await tx.tenantDepixFeeConfig.findUnique({
    where: { tenantId },
  })
  if (!existingFeeConfig) {
    await tx.tenantDepixFeeConfig.create({
      data: isCentralTenant
        ? {
            tenantId,
            entryFeeFixed: 0,
            entryFeePercent: 0,
            exitFeeFixed: 0,
            exitFeePercent: 0,
          }
        : { tenantId },
    })
  }
}

async function isCentralTenantId(
  tx: Prisma.TransactionClient,
  tenantId: string,
): Promise<boolean> {
  // Importacao tardia pra evitar dependencia circular (trpc.ts importa
  // varios services indiretamente).
  const { CENTRAL_TENANT_SLUG } = await import("@/server/api/trpc")
  const t = await tx.tenant.findUnique({
    where: { id: tenantId },
    select: { slug: true },
  })
  return t?.slug === CENTRAL_TENANT_SLUG
}

export { FIXED_CATEGORIES, DEFAULT_PAYMENT_METHODS, DEFAULT_CARD_BRANDS }
