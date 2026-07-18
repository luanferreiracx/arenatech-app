/**
 * Semântica de status da transação DePix (fonte única de predicados sobre o enum
 * DepixTransactionStatus). Mantém as decisões "este status permite tal efeito?"
 * num só lugar, testável, em vez de espalhadas em `if`s pelos handlers.
 */

/**
 * Status em que o depósito representa um PIX RECEBIDO e ainda NÃO revertido —
 * portanto o efeito de VENDA (liberar PDV/QuickSale) pode ser aplicado.
 *
 * Existe pra fechar a corrida da auditoria WH-3: entre a revalidação do `approved`
 * e o applyPixReceivedEffects, um webhook MED (devolução do BC) pode mudar a tx
 * para MED_REFUNDED. Sem checar o status atual, a venda seria liberada mesmo com o
 * depósito revertido. Só liberamos se o status ainda for compatível com "pago".
 */
const SALE_RELEASABLE_STATUSES = new Set([
  "PROCESSING", // PIX pago, aguardando confirmação on-chain
  "PROCESSING_FEE", // depósito recebido, debitando taxa
  "COMPLETED", // concluído
  "COMPLETED_FEE_PENDING", // depósito ok, taxa pendente (reconciliar) — venda vale
]);

/**
 * O efeito de venda pode ser aplicado para uma tx de depósito neste status?
 * Fail-safe: qualquer status revertido/terminal/desconhecido → false.
 */
export function maySettleSaleEffect(status: string): boolean {
  return SALE_RELEASABLE_STATUSES.has(status);
}
