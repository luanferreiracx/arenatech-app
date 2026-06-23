/**
 * Fonte unica de "receita de mercadoria" de uma venda — base correta para
 * lucro e relatorios.
 *
 * Regra: **receita = subtotal − desconto**. NUNCA subtrair o upgrade (trade-in).
 *
 * Por que: o aparelho de entrada (upgrade) vira ATIVO de estoque — na
 * finalizacao a venda gera um `DevicePurchase` + `StockItem` com custo =
 * `abatedValue`, e o lucro dele aparece quando ele for revendido. O `abatedValue`
 * apenas reduz o que o cliente PAGA agora (`Sale.totalAmount = subtotal −
 * desconto − upgrade`), nao a receita da venda.
 *
 * O bug que isto corrige: relatorios usavam `totalAmount` (liquido do upgrade)
 * como receita e faziam `lucro = totalAmount − custo`. Com um trade-in alto, o
 * "valor" virava so a diferenca e o lucro ficava negativo. Em downgrade
 * (`totalAmount = 0`) ficava sempre negativo.
 */

/** Receita de mercadoria (centavos) = max(0, subtotal − desconto). */
export function saleGoodsRevenueCents(subtotalCents: number, discountCents: number): number {
  return Math.max(0, subtotalCents - discountCents);
}

/** Lucro bruto da venda (centavos) = receita de mercadoria − custo das mercadorias. */
export function saleGrossProfitCents(
  subtotalCents: number,
  discountCents: number,
  costCents: number,
): number {
  return saleGoodsRevenueCents(subtotalCents, discountCents) - costCents;
}
