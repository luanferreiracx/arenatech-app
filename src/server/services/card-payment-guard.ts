/**
 * Enforcement server-side da configuração de cartão no `sale.finalize`
 * (auditoria PDV 2026-07-09, R1/R2).
 *
 * O frontend (#474) já exige adquirente + bandeira ao adicionar um pagamento no
 * cartão, mas o `finalizeSaleSchema` deixa `paymentMethodId`, `acquirerId`,
 * `cardBrandId` e `cardKind` OPCIONAIS. Uma chamada direta à API, um fluxo
 * não-PDV ou qualquer regressão de UI reabriria o mesmo buraco: venda no cartão
 * SEM taxa (fee 0) e SEM CardReceivable. Este guard é a defesa em profundidade —
 * a autoridade final é o servidor.
 *
 * Política (decisão do dono): BLOQUEAR SEMPRE. Todo pagamento em cartão exige
 * forma de pagamento configurada + adquirente + bandeira + tipo; débito nunca
 * parcela. Função pura (sem I/O) — o caller resolve o tipo do PaymentMethod e
 * lança o TRPCError com a mensagem retornada.
 */

export interface CardGuardPayment {
  method: string;
  paymentMethodId?: string | null;
  acquirerId?: string | null;
  cardBrandId?: string | null;
  cardKind?: "CREDIT" | "DEBIT" | null;
  installments?: number | null;
}

/** Códigos de forma de pagamento (fallback, sem PaymentMethod cadastrado) que são cartão. */
const FALLBACK_CARD_METHODS = new Set(["cartao_credito", "cartao_debito"]);

/**
 * `true` quando o pagamento é em cartão. Sinais (qualquer um basta):
 * - o `PaymentMethod` referenciado é do tipo CREDIT_CARD/DEBIT_CARD;
 * - o `method` é um código de cartão do fallback;
 * - já veio `cardKind` (crédito/débito).
 */
export function isCardPayment(
  payment: CardGuardPayment,
  paymentMethodType: string | null | undefined,
): boolean {
  return (
    paymentMethodType === "CREDIT_CARD" ||
    paymentMethodType === "DEBIT_CARD" ||
    FALLBACK_CARD_METHODS.has(payment.method) ||
    payment.cardKind != null
  );
}

/**
 * Retorna a mensagem de erro quando um pagamento em cartão está sem a config
 * obrigatória, ou `null` quando está OK (ou não é cartão). Puro/testável.
 */
export function cardPaymentConfigError(
  payment: CardGuardPayment,
  paymentMethodType: string | null | undefined,
): string | null {
  if (!isCardPayment(payment, paymentMethodType)) return null;

  // 1) Forma de pagamento configurada (garante taxa/parcelamento validados e o
  //    breakdown do DRE batendo com o CardReceivable).
  if (!payment.paymentMethodId) {
    return "Pagamento no cartão exige uma forma de pagamento configurada (Configurações → Formas de Pagamento).";
  }

  // 2) Adquirente + bandeira + tipo — sem isso não há taxa real nem recebível.
  if (!payment.acquirerId || !payment.cardBrandId || !payment.cardKind) {
    return "Pagamento no cartão exige adquirente e bandeira. Selecione a maquininha e a bandeira.";
  }

  // 3) Débito é sempre à vista.
  if (payment.cardKind === "DEBIT" && (payment.installments ?? 1) > 1) {
    return "Cartão de débito não aceita parcelamento (apenas 1x).";
  }

  return null;
}
