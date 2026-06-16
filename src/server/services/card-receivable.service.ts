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
