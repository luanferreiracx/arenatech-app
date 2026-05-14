import { TRPCError } from "@trpc/server";
import { createTRPCRouter, tenantProcedure } from "@/server/api/trpc";
import { simulateSchema } from "@/lib/validators/simulator";
import type { SimulationResult } from "@/lib/validators/simulator";

/**
 * Simulador de parcelamento.
 *
 * Usa as taxas de InstallmentRule do tenant. A formula e identica ao Laravel:
 * valorComTaxa = (valor * 100) / (100 - taxa)
 *
 * As taxas de debito e credito avista vem de PaymentMethod.feePercent.
 * As taxas de parcelamento vem de InstallmentRule.feePercent.
 */
export const simulatorRouter = createTRPCRouter({
  simulate: tenantProcedure
    .input(simulateSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const valorProduto = input.valorProduto;
        const valorEntrada = input.valorEntrada ?? 0;
        const valorFinanciar = Math.max(0, valorProduto - valorEntrada);

        // Get payment methods with their fees
        const paymentMethods = await tx.paymentMethod.findMany({
          where: { active: true },
          include: {
            installmentRules: {
              orderBy: { installments: "asc" },
            },
          },
        });

        // Find debit and credit methods
        const debitMethod = paymentMethods.find((pm) => pm.type === "DEBIT_CARD");
        const creditMethod = paymentMethods.find((pm) => pm.type === "CREDIT_CARD");

        const taxaDebito = debitMethod ? Number(debitMethod.feePercent) : 0;
        const taxaAvista = creditMethod ? Number(creditMethod.feePercent) : 0;

        // Calculate debit total
        const debitoTotal = grossUp(valorFinanciar, taxaDebito);

        // Calculate credit a vista
        const avistaTotal = grossUp(valorFinanciar, taxaAvista);

        // Calculate installments from rules
        const parcelas: SimulationResult["parcelas"] = [];

        if (creditMethod) {
          const rules = creditMethod.installmentRules;
          for (const rule of rules) {
            const n = rule.installments;
            const taxa = Number(rule.feePercent);

            // Check minimum amount
            const minAmount = Number(rule.minAmount);
            if (minAmount > 0 && valorFinanciar < minAmount) continue;

            const total = grossUp(valorFinanciar, taxa);
            parcelas.push({
              n,
              taxa,
              total,
              parcela: Math.round((total / n) * 100) / 100,
            });
          }
        }

        const result: SimulationResult = {
          valorProduto,
          valorEntrada,
          valorFinanciar,
          debito: { taxa: taxaDebito, total: debitoTotal },
          avista: { taxa: taxaAvista, total: avistaTotal },
          parcelas,
          maxParcelas: parcelas.length > 0 ? parcelas[parcelas.length - 1]!.n : 1,
        };

        return result;
      });
    }),
});

/**
 * Gross-up formula: base * 100 / (100 - taxa)
 * Identical to Laravel SimuladorParcelamentoService::grossUp
 */
function grossUp(base: number, taxa: number): number {
  if (taxa <= 0) return Math.round(base * 100) / 100;
  const denom = 100 - taxa;
  if (denom <= 0) return Math.round(base * 100) / 100;
  return Math.round((base * 100) / denom * 100) / 100;
}
