/**
 * Custo médio ponderado móvel (padrão contábil brasileiro para valoração de
 * estoque). A cada entrada com custo informado, o custo unitário do item passa a
 * ser a média ponderada entre o que já havia e o que entrou:
 *
 *   novoCusto = (qtdAtual × custoAtual + qtdEntrada × custoEntrada) / (qtdAtual + qtdEntrada)
 *
 * Tudo em CENTAVOS (inteiro) para não acumular erro de ponto flutuante; o
 * resultado é arredondado ao centavo.
 *
 * Casos de borda:
 *  - Sem histórico de custo (custoAtual nulo/≤0) ou sem saldo (qtdAtual ≤ 0):
 *    o custo passa a ser exatamente o custo da entrada (primeira valoração).
 *  - qtdEntrada ≤ 0: retorna o custo atual (nada a ponderar).
 */
export function weightedAverageCostCents(
  currentQty: number,
  currentCostCents: number | null,
  entryQty: number,
  entryUnitCents: number,
): number {
  if (entryQty <= 0) return currentCostCents ?? entryUnitCents;
  if (currentQty <= 0 || currentCostCents == null || currentCostCents <= 0) {
    return entryUnitCents;
  }
  const totalValue = currentQty * currentCostCents + entryQty * entryUnitCents;
  const totalQty = currentQty + entryQty;
  return Math.round(totalValue / totalQty);
}
