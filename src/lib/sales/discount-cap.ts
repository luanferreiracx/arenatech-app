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
