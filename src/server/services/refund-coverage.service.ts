/**
 * Seleção de itens a cancelar para cobrir um valor estornado (estorno parcial).
 *
 * Usado para parcelas (Installment) e recebíveis de cartão (CardReceivable): dado
 * uma lista ordenada (do prazo mais distante para o mais próximo) e o valor a
 * cobrir, retorna os ids a cancelar. Cancela itens INTEIROS — não fraciona.
 *
 * Função pura, em centavos. Testável sem banco.
 */
export interface CoverageItem {
  id: string;
  /** Valor (líquido/devido) do item em centavos. */
  amountCents: number;
}

/**
 * Retorna os ids a cancelar (na ordem dada) até que a soma dos valores cubra
 * `amountToCoverCents`. Ignora itens de valor <= 0. Para assim que cobre.
 */
export function selectIdsToCover(
  items: CoverageItem[],
  amountToCoverCents: number,
): string[] {
  if (amountToCoverCents <= 0) return [];
  let remaining = amountToCoverCents;
  const ids: string[] = [];
  for (const item of items) {
    if (remaining <= 0) break;
    if (item.amountCents <= 0) continue;
    ids.push(item.id);
    remaining -= item.amountCents;
  }
  return ids;
}
