/**
 * Reconciliação de valor no pagamento de OS (achado OS1).
 *
 * O `registerPayment` marcava a OS como PAID com qualquer `paidAmount`, sem
 * conferir se cobria o total — um recebimento parcial (ex.: R$1 numa OS de
 * R$500) fechava a OS como paga. O PDV já rejeita subpagamento; aqui espelhamos.
 *
 * Cobertura = `paidAmount + desconto` (o desconto = paymentDiscount +
 * rewardDiscount, o que a loja abriu mão). Fecho legítimo por menos = aplicar um
 * desconto que registra o porquê, em vez de "pagar menos" silenciosamente.
 *
 * Função pura (centavos) — testável sem banco.
 */

/** Tolerância de arredondamento (1 centavo) ao comparar cobertura × total. */
export const OS_PAYMENT_TOLERANCE_CENTS = 1;

export type OsPaymentReconciliation = {
  /** Total devido da OS, em centavos. */
  orderTotalCents: number;
  /** Valor efetivamente pago pelo cliente (input.paidAmount), em centavos. */
  paidCents: number;
  /** Desconto concedido (paymentDiscount + rewardDiscount), em centavos. */
  discountCents: number;
  /** Garantia ou OS sem valor: não há o que reconciliar. */
  skip: boolean;
};

/**
 * Quanto falta para quitar a OS (0 = coberta). Retorna 0 quando `skip` (garantia
 * / total ≤ 0) ou quando a diferença está dentro da tolerância de 1 centavo.
 */
export function osPaymentShortfallCents(args: OsPaymentReconciliation): number {
  if (args.skip || args.orderTotalCents <= 0) return 0;
  const covered = args.paidCents + args.discountCents;
  const shortfall = args.orderTotalCents - covered;
  return shortfall > OS_PAYMENT_TOLERANCE_CENTS ? shortfall : 0;
}
