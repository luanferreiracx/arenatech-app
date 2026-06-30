/**
 * Cálculo de liquidação de cartão (fundação do controle de recebíveis).
 *
 * Dado uma taxa de adquirente (AcquirerRate) e o valor bruto da venda, calcula
 * a taxa cobrada, o valor líquido que a loja vai receber e a data esperada de
 * liquidação (D+N corridos a partir da venda).
 *
 * Tudo em centavos inteiros. Função pura — testável sem banco.
 */

export interface CardSettlementRate {
  feePercent: number; // ex: 2.99
  feeFixed: number; // centavos
  settlementDays: number; // D+N corridos
}

export interface CardSettlement {
  grossCents: number;
  feeCents: number;
  netCents: number;
  settlementDate: Date;
}

/**
 * Calcula taxa, líquido e data de liquidação de um recebível de cartão.
 *
 * Taxa = bruto × feePercent% + feeFixed. Líquido = bruto − taxa (mínimo 0).
 * Data = saleDate + settlementDays (dias corridos).
 */
export function computeCardSettlement(
  rate: CardSettlementRate,
  grossCents: number,
  saleDate: Date,
): CardSettlement {
  if (grossCents < 0) {
    throw new Error("grossCents não pode ser negativo");
  }
  const percentFee = Math.round((grossCents * rate.feePercent) / 100);
  const feeCents = Math.min(grossCents, percentFee + Math.max(0, rate.feeFixed));
  const netCents = grossCents - feeCents;
  return {
    grossCents,
    feeCents,
    netCents,
    settlementDate: addCalendarDays(saleDate, rate.settlementDays),
  };
}

/** Soma N dias corridos a uma data, preservando o horário. */
export function addCalendarDays(date: Date, days: number): Date {
  const result = new Date(date.getTime());
  result.setDate(result.getDate() + days);
  return result;
}

export interface CardReceivableInstallment {
  installmentNumber: number;
  installmentsTotal: number;
  grossCents: number;
  feeCents: number;
  netCents: number;
  settlementDate: Date;
}

/**
 * Divide o valor bruto de um pagamento no cartão em N recebíveis (1 por parcela
 * da operadora). Cada parcela:
 * - bruto = total / N (a última absorve o resto, soma fecha)
 * - taxa/líquido = computeCardSettlement sobre o bruto da parcela
 * - liquida em D+N + 30×(parcela−1) dias (parcela 1 em D+N, parcela 2 em D+N+30…)
 *
 * Convenção de mercado: a taxa total é cobrada distribuída entre as parcelas e
 * cada parcela cai mês a mês. Mantém soma de bruto/líquido fiel ao total.
 */
export function splitCardReceivable(
  rate: CardSettlementRate,
  totalGrossCents: number,
  installments: number,
  saleDate: Date,
): CardReceivableInstallment[] {
  if (totalGrossCents < 0) throw new Error("totalGrossCents não pode ser negativo");
  const n = Math.max(1, Math.floor(installments));
  const perInstallment = Math.floor(totalGrossCents / n);
  const remainder = totalGrossCents - perInstallment * n;

  const result: CardReceivableInstallment[] = [];
  for (let i = 1; i <= n; i++) {
    // Última parcela absorve o resto da divisão (dízima).
    const grossCents = i === n ? perInstallment + remainder : perInstallment;
    const settlement = computeCardSettlement(
      { ...rate, settlementDays: rate.settlementDays + 30 * (i - 1) },
      grossCents,
      saleDate,
    );
    result.push({
      installmentNumber: i,
      installmentsTotal: n,
      grossCents: settlement.grossCents,
      feeCents: settlement.feeCents,
      netCents: settlement.netCents,
      settlementDate: settlement.settlementDate,
    });
  }
  return result;
}

/**
 * Diferença de conciliação: líquido REAL recebido − líquido esperado (centavos).
 * Positivo = recebeu mais que o esperado; negativo = recebeu menos (taxa a mais
 * da adquirente, p.ex.); zero = bateu certo. `divergent` quando ≠ 0.
 */
export function reconciliationDifference(
  expectedNetCents: number,
  settledNetCents: number,
): { differenceCents: number; divergent: boolean } {
  const differenceCents = settledNetCents - expectedNetCents;
  return { differenceCents, divergent: differenceCents !== 0 };
}

// ── Resolução da AcquirerRate (fonte única da taxa de cartão) ──

type AcquirerRateLookupTx = {
  acquirerRate: {
    findFirst: (args: object) => Promise<{
      feePercent: { toString(): string } | number;
      feeFixed: { toString(): string } | number;
      settlementDays: number;
    } | null>;
  };
};

export interface AcquirerRateKey {
  acquirerId: string;
  cardBrandId: string;
  kind: "CREDIT" | "DEBIT";
  installments: number;
}

/**
 * Resolve a taxa do cartão (AcquirerRate) por adquirente×bandeira×tipo×parcela.
 * Fonte ÚNICA da taxa de cartão — usada tanto pelo breakdown da venda
 * (payment-calculator) quanto pela geração do recebível (generateCardReceivables)
 * e pelo preview (receiving.previewCardSettlement), pra que os três usem
 * exatamente a mesma taxa. Retorna a taxa em CENTAVOS (feeFixed) ou null se não
 * houver taxa ativa cadastrada para a combinação.
 */
export async function resolveAcquirerRate(
  tx: AcquirerRateLookupTx,
  tenantId: string,
  key: AcquirerRateKey,
): Promise<CardSettlementRate | null> {
  const rate = await tx.acquirerRate.findFirst({
    where: {
      tenantId,
      acquirerId: key.acquirerId,
      cardBrandId: key.cardBrandId,
      kind: key.kind,
      installments: key.installments,
      active: true,
    },
    select: { feePercent: true, feeFixed: true, settlementDays: true },
  });
  if (!rate) return null;
  return {
    feePercent: Number(rate.feePercent),
    feeFixed: Math.round(Number(rate.feeFixed) * 100), // reais → centavos
    settlementDays: rate.settlementDays,
  };
}

/**
 * Taxa total (centavos) de um pagamento no cartão, calculada com a MESMA
 * matemática do recebível: `splitCardReceivable` por parcela (feeFixed por
 * parcela + arredondamento por slice). É o que garante que o `operatorFee` do
 * breakdown da venda bate, centavo a centavo, com a soma dos `feeAmount` dos
 * CardReceivable gerados — DRE = recebível.
 */
export function totalCardFeeCents(
  rate: CardSettlementRate,
  grossCents: number,
  installments: number,
  saleDate: Date = new Date(),
): number {
  return splitCardReceivable(rate, grossCents, installments, saleDate).reduce(
    (sum, s) => sum + s.feeCents,
    0,
  );
}
