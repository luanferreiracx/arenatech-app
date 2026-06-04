/**
 * Tool de parcelamento — simula parcelas de aparelho/serviço. Somente leitura.
 *
 * Reusa a MESMA fonte de taxas do módulo Simulador (SimulatorRateConfig +
 * tiers) e a MESMA fórmula gross-up (base * 100 / (100 - taxa)), pra garantir
 * paridade com o que o cliente vê no simulador oficial. As taxas já têm a
 * margem do lojista embutida (taxas exibidas ao cliente, não as reais do PDV).
 *
 * Fallback: se o tenant não tem config, usa os defaults de @/lib/simulator-defaults
 * (mesma fonte que o router do simulador).
 */

import { z } from "zod";
import {
  DEFAULT_SIMULATOR_MAX_INSTALLMENTS,
  DEFAULT_SIMULATOR_CREDIT_AVISTA_FEE,
  DEFAULT_SIMULATOR_DEBIT_FEE,
  defaultSimulatorTiers,
} from "@/lib/simulator-defaults";
import { formatBRL, type TalisonTool, type TalisonTx } from "@/lib/talison/tools/contract";

/** Gross-up idêntico ao SimulatorRouter / Laravel SimuladorParcelamentoService. */
function grossUp(base: number, taxa: number): number {
  if (taxa <= 0) return Math.round(base * 100) / 100;
  const denom = 100 - taxa;
  if (denom <= 0) return Math.round(base * 100) / 100;
  return Math.round(((base * 100) / denom) * 100) / 100;
}

async function loadConfig(tx: TalisonTx, tenantId: string) {
  const existing = await tx.simulatorRateConfig.findUnique({
    where: { tenantId },
    include: { tiers: true },
  });
  if (existing) {
    return {
      creditAvistaFeePercent: Number(existing.creditAvistaFeePercent),
      debitFeePercent: Number(existing.debitFeePercent),
      maxInstallments: existing.maxInstallments,
      tiers: existing.tiers.map((t) => ({ installments: t.installments, feePercent: Number(t.feePercent) })),
    };
  }
  return {
    creditAvistaFeePercent: DEFAULT_SIMULATOR_CREDIT_AVISTA_FEE,
    debitFeePercent: DEFAULT_SIMULATOR_DEBIT_FEE,
    maxInstallments: DEFAULT_SIMULATOR_MAX_INSTALLMENTS,
    tiers: defaultSimulatorTiers(),
  };
}

const simularSchema = z.object({
  valor: z
    .number()
    .positive()
    .describe("Valor do produto/serviço em reais (ex: 4299.99). Use o preço que veio de uma tool ou que o cliente confirmou — nunca invente."),
  entrada: z
    .number()
    .min(0)
    .optional()
    .describe("Valor de entrada em reais, se o cliente mencionar. Default 0."),
});

export const simularParcelamento: TalisonTool<typeof simularSchema> = {
  name: "simular_parcelamento",
  description:
    "Simula o parcelamento no cartão de um valor (aparelho ou serviço). Use quando o cliente " +
    "perguntar 'em quantas vezes?' ou 'quanto fica parcelado?'. O valor de entrada (parâmetro 'valor') " +
    "DEVE vir de uma tool de preço ou de um valor que o cliente confirmou — nunca invente o valor base. " +
    "Retorna as parcelas com os totais; copie exatamente.",
  schema: simularSchema,
  async execute(args, ctx) {
    return ctx.withTenant(async (tx) => {
      const config = await loadConfig(tx, ctx.tenantId);
      const valorFinanciar = Math.max(0, args.valor - (args.entrada ?? 0));

      // Só oferta parcelas com taxa > 0 (paridade Laravel/simulador: juros 0 não é ofertado aqui).
      const parcelas = config.tiers
        .filter((tier) => tier.installments <= config.maxInstallments && tier.feePercent > 0)
        .sort((a, b) => a.installments - b.installments)
        .map((tier) => {
          const total = grossUp(valorFinanciar, tier.feePercent);
          return { n: tier.installments, total, parcela: Math.round((total / tier.installments) * 100) / 100 };
        });

      if (parcelas.length === 0) {
        return {
          ok: false as const,
          reason: "Não há tabela de parcelamento configurada. Ofereça transferir pra um atendente simular.",
        };
      }

      const lines = parcelas.map(
        (p) => `${p.n}x de ${formatBRL(p.parcela)} (total ${formatBRL(p.total)})`,
      );

      return {
        ok: true as const,
        data: {
          valor_base: formatBRL(args.valor),
          entrada: formatBRL(args.entrada ?? 0),
          parcelas: parcelas.map((p) => ({ vezes: p.n, parcela: formatBRL(p.parcela), total: formatBRL(p.total) })),
        },
        display: lines.join("\n"),
      };
    });
  },
};
