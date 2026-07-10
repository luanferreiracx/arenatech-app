/**
 * Decisão pura de QUAIS FinancialTransaction (RECEIVABLE) uma venda gera —
 * auditoria PDV R4 fase 2. Extraída do `finalize` para ser testável (o write de
 * dinheiro é o pedaço mais sensível).
 *
 * FONTE ÚNICA: o dinheiro de CARTÃO NÃO gera FinancialTransaction (vive no
 * CardReceivable). Esta função recebe SÓ os pagamentos NÃO-cartão e devolve as
 * specs de FT a criar:
 *  - nenhum pagamento não-cartão (venda 100% cartão) → [] (sem FT);
 *  - algum não-cartão parcelado (crediário) → 1 FT por pagamento (PENDING+parcelas
 *    se >1x; PAID se à vista);
 *  - todos não-cartão à vista → 1 FT agregada PAID pelo total não-cartão.
 */

export interface NonCardPayment {
  amount: number; // centavos (mercadoria desta forma)
  installments?: number | null;
  method: string;
}

export interface ReceivableSpec {
  amountCents: number;
  /** 1 = à vista. >1 = parcelado (gera Installments). */
  installments: number;
  paymentMethod: string;
  status: "PAID" | "PENDING";
}

export function planSaleReceivables(
  nonCardPayments: NonCardPayment[],
  aggregate: { totalCents: number; paymentMethod: string },
): ReceivableSpec[] {
  if (nonCardPayments.length === 0) return [];

  const hasInstallments = nonCardPayments.some((p) => (p.installments ?? 1) > 1);
  if (!hasInstallments) {
    // Single/misto à vista → 1 FT PAID pelo total não-cartão.
    return [
      {
        amountCents: aggregate.totalCents,
        installments: 1,
        paymentMethod: aggregate.paymentMethod,
        status: "PAID",
      },
    ];
  }

  // Há parcelamento não-cartão → 1 FT por pagamento.
  return nonCardPayments.map((p) => {
    const n = p.installments ?? 1;
    return {
      amountCents: p.amount,
      installments: n,
      paymentMethod: p.method,
      status: n > 1 ? "PENDING" : "PAID",
    };
  });
}
