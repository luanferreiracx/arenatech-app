/**
 * Qual valor a página pública envia ao gerar o PIX.
 *
 * Parece trivial demais para virar módulo, mas foi exatamente aqui que a
 * cobrança com valor fixo quebrou: a tela decidia o que ENVIAR usando o mesmo
 * flag que decide se o campo é EDITÁVEL (`amountOpen`). Com o valor travado ela
 * mandava `null`, o servidor lia 0 e recusava por "valor mínimo" — enquanto o
 * botão seguia habilitado, porque a validação do cliente usava o preset certo.
 *
 * Separado do componente porque é uma regra de dinheiro: aqui ela é testável
 * sem montar a tela, e a assinatura força quem chama a passar as três coisas de
 * que a decisão depende.
 */

export type ChargeAmountInput = {
  /** Valor definido pelo operador na URL (`?valor=`), em centavos. */
  presetCents: number | null;
  /** O cliente pode digitar o valor? Falso quando o operador já o fixou. */
  amountOpen: boolean;
  /** O que o cliente digitou, em centavos. */
  enteredCents: number;
};

/**
 * Devolve o valor em centavos, ou `null` quando não há valor a cobrar — caso em
 * que o servidor recusa. Nunca inventa um valor: sem preset e sem digitação, a
 * resposta é `null`, não zero.
 *
 * O preset vence a digitação de propósito. Se o operador combinou R$ 150,00,
 * nenhum resíduo no estado da tela pode cobrar outra coisa.
 */
export function resolveChargeAmountCents({
  presetCents,
  amountOpen,
  enteredCents,
}: ChargeAmountInput): number | null {
  if (presetCents != null) return presetCents;
  if (amountOpen && enteredCents > 0) return enteredCents;
  return null;
}
