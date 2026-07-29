/**
 * Teto de desconto do PDV. Admin do tenant é irrestrito; demais usuários ficam
 * limitados ao percentual configurado em TenantReceivingSettings
 * (maxDiscountPercentNonAdmin). Fonte única usada pelo desconto do carrinho
 * (applyDiscount) e pelo override de preço de item (updateItemPrice), para que o
 * operador não contorne o teto baixando o preço do item.
 */

export interface DiscountCapContext {
  /** Percentual de desconto que se quer aplicar (0-100). */
  requestedPercent: number;
  /** true se o usuário é admin do tenant (irrestrito). */
  isAdmin: boolean;
  /** Teto configurado; null/undefined = sem teto. */
  maxPercentNonAdmin: number | null | undefined;
}

/**
 * `true` quando o desconto é permitido. Admin sempre pode. Sem teto configurado,
 * qualquer um pode. Caso contrário, o percentual pedido não pode passar do teto.
 * Comparação com pequena tolerância para absorver ruído de ponto flutuante ao
 * derivar o percentual de valores em centavos.
 */
export function isDiscountAllowed(ctx: DiscountCapContext): boolean {
  if (ctx.isAdmin) return true;
  if (ctx.maxPercentNonAdmin == null) return true;
  const EPSILON = 0.01;
  return ctx.requestedPercent <= ctx.maxPercentNonAdmin + EPSILON;
}

/** Percentual de desconto (0-100) equivalente a um valor absoluto sobre a base. */
export function discountPercentOf(discountCents: number, baseCents: number): number {
  if (baseCents <= 0) return 0;
  return (discountCents / baseCents) * 100;
}

/** Uma linha do carrinho, com o preço de tabela e o preço efetivamente cobrado. */
export interface CartLineForCap {
  listUnitPriceCents: number;
  chargedUnitPriceCents: number;
  quantity: number;
}

/**
 * Desconto TOTAL do carrinho sobre o preço de tabela, em percentual.
 *
 * O teto era medido em dois pedaços isolados — o override de preço do item
 * contra a tabela, e o desconto do carrinho contra o subtotal JÁ reduzido pelos
 * overrides. Com teto de 10%, o operador baixava cada item 10% e depois dava
 * mais 10% no carrinho: o servidor lia "10%" nas duas vezes e o desconto real
 * sobre a tabela era 19%.
 *
 * Aqui a conta é uma só: quanto o cliente deixa de pagar em relação à tabela,
 * somando override de item e desconto de carrinho.
 *
 * Linha sem preço de tabela conhecido (produto sem `salePrice`) entra pelo preço
 * cobrado — sem referência não há desconto a medir, e inventar uma faria o teto
 * disparar em venda legítima.
 */
export function cartDiscountPercent(
  lines: CartLineForCap[],
  cartDiscountCents: number,
): number {
  let listTotal = 0;
  let chargedTotal = 0;
  for (const line of lines) {
    const list = line.listUnitPriceCents > 0 ? line.listUnitPriceCents : line.chargedUnitPriceCents;
    listTotal += list * line.quantity;
    chargedTotal += line.chargedUnitPriceCents * line.quantity;
  }
  if (listTotal <= 0) return 0;
  // Markup (cobrar acima da tabela) não vira "desconto negativo" que abriria
  // espaço para descontar mais em outra linha.
  const itemDiscount = Math.max(0, listTotal - chargedTotal);
  return discountPercentOf(itemDiscount + Math.max(0, cartDiscountCents), listTotal);
}
