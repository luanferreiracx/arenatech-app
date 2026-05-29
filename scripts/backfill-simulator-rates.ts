/**
 * backfill-simulator-rates.ts
 *
 * Cria SimulatorRateConfig para tenants que ainda nao tem, derivando as taxas
 * dos dados ja existentes:
 *   - debito  <- PaymentMethod(type=DEBIT_CARD).feePercent
 *   - credito a vista <- PaymentMethod(type=CREDIT_CARD).feePercent
 *   - tiers   <- InstallmentRule (installments + feePercent) do cartao de credito
 *
 * Contexto: antes desta feature o simulador usava InstallmentRule/PaymentMethod
 * direto. Na migracao de dados do Laravel, as taxas EXIBIDAS AO CLIENTE
 * (configuracoes_parcelamento) cairam em installment_rules. Este script
 * preserva exatamente o que o cliente ja via, em vez de cair nos defaults
 * genericos do getOrCreateSimulatorConfig.
 *
 * Idempotente: pula tenants que ja tem SimulatorRateConfig.
 *
 * Uso:
 *   DATABASE_URL="postgresql://..." tsx scripts/backfill-simulator-rates.ts [--dry-run]
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });
const dryRun = process.argv.includes("--dry-run");

async function main() {
  const tenants = await prisma.tenant.findMany({ select: { id: true, slug: true } });
  let created = 0;
  let skipped = 0;

  for (const tenant of tenants) {
    const existing = await prisma.simulatorRateConfig.findUnique({
      where: { tenantId: tenant.id },
    });
    if (existing) {
      skipped++;
      continue;
    }

    const paymentMethods = await prisma.paymentMethod.findMany({
      where: { tenantId: tenant.id, active: true },
      include: { installmentRules: { orderBy: { installments: "asc" } } },
    });
    const debit = paymentMethods.find((pm) => pm.type === "DEBIT_CARD");
    const credit = paymentMethods.find((pm) => pm.type === "CREDIT_CARD");

    const debitFee = debit ? Number(debit.feePercent) : 0;
    const creditAvistaFee = credit ? Number(credit.feePercent) : 0;
    const rules = credit?.installmentRules ?? [];
    const tiers = rules
      .filter((r) => r.installments >= 2 && r.installments <= 36)
      .map((r) => ({ installments: r.installments, feePercent: Number(r.feePercent) }));
    const maxInstallments =
      tiers.length > 0 ? Math.max(...tiers.map((t) => t.installments)) : 12;

    console.log(
      `[${tenant.slug}] debito=${debitFee}% credito_avista=${creditAvistaFee}% tiers=${tiers.length} max=${maxInstallments}`,
    );

    if (dryRun) {
      created++;
      continue;
    }

    await prisma.simulatorRateConfig.create({
      data: {
        tenantId: tenant.id,
        creditAvistaFeePercent: creditAvistaFee,
        debitFeePercent: debitFee,
        maxInstallments,
        tiers: {
          create: tiers.map((t) => ({
            tenantId: tenant.id,
            installments: t.installments,
            feePercent: t.feePercent,
          })),
        },
      },
    });
    created++;
  }

  console.log(
    `\n${dryRun ? "[DRY-RUN] " : ""}Concluido: ${created} criados, ${skipped} ja existentes.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
