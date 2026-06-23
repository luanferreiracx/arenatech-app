/**
 * Fonte única do cálculo de desconto de uma venda (PDV).
 *
 * Invariante: o desconto efetivo NUNCA excede o subtotal. Isso importa porque o
 * desconto é gravado no rascunho e o carrinho muda depois — remover itens reduz
 * o subtotal. Um desconto FIXO já gravado pode passar a ser maior que o novo
 * subtotal; sem clampar, o líquido (`subtotal − desconto − upgrade`) fica
 * negativo e a venda é interpretada como **downgrade** (a loja devolveria
 * dinheiro que o cliente nunca pagou). O clamp também blinda percentual fora de
 * faixa (0–100).
 */

export type DiscountType = "percentage" | "fixed" | string | null;

/**
 * Desconto efetivo em centavos, sempre dentro de `[0, subtotalCents]`.
 *
 * - `percentage`: aplica a alíquota (0–100) sobre o subtotal e clampa.
 * - `fixed` (qualquer outro tipo): usa o valor nominal já resolvido em centavos
 *   e clampa ao subtotal.
 */
export function effectiveDiscountCents(args: {
  discountType: DiscountType;
  /** Alíquota 0–100 quando `percentage`. Ignorado quando fixo. */
  percentValue?: number;
  /** Valor nominal em centavos quando fixo. Ignorado quando percentual. */
  fixedNominalCents?: number;
  subtotalCents: number;
}): number {
  const { discountType, subtotalCents } = args;
  if (subtotalCents <= 0) return 0;

  if (discountType === "percentage") {
    const pct = Math.min(Math.max(args.percentValue ?? 0, 0), 100);
    return Math.min(Math.round(subtotalCents * (pct / 100)), subtotalCents);
  }

  const nominal = Math.max(Math.round(args.fixedNominalCents ?? 0), 0);
  return Math.min(nominal, subtotalCents);
}
