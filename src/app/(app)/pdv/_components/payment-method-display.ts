/**
 * Regras de exibicao do form de pagamento derivadas do TIPO/flags da forma de
 * pagamento — nunca do `code`/key.
 *
 * Por que isolado e puro: formas cadastradas pela UI nao gravam `code`, entao a
 * key do seletor vira o UUID. Comparar a key com strings fixas
 * ("cartao_credito"/"dinheiro") fazia o seletor de parcelas e o campo de troco
 * sumirem pra qualquer tenant que configurou as proprias formas. Derivar de
 * `acceptsInstallments` e do `type` (CASH) funciona pros dois caminhos
 * (formas do banco e fallback estatico).
 */

/** Forma de pagamento tipada como PaymentMethodType (CASH). */
export const CASH_PAYMENT_TYPE = "CASH";

/** Mostra o seletor de parcelas quando a forma aceita parcelamento. */
export function methodShowsInstallments(
  option: { acceptsInstallments: boolean } | undefined,
): boolean {
  return option?.acceptsInstallments ?? false;
}

/** Mostra o campo de troco quando a forma e dinheiro. */
export function methodShowsChange(type: string | undefined): boolean {
  return type === CASH_PAYMENT_TYPE;
}
