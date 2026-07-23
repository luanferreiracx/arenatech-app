import { sanitizeProductName } from "./product-name";

/** Rótulo quando não há modelo informado (paridade Laravel). */
const FALLBACK_NAME = "Aparelho seminovo";

/**
 * Nome canônico do produto de um aparelho-de-entrada (trade-in). Fonte única
 * usada ao gravar o SaleUpgrade e ao criar/deduplicar o Product do trade-in.
 *
 * O modelo chega poluído do fluxo de avaliação ("Apple Apple iPhone 16") e o
 * código antigo ainda prependia a marca (`[brand, model].join(" ")`), acumulando
 * "Apple". Isso fazia o dedup por nome nunca casar o produto do catálogo
 * ("iPhone 16") → nascia uma duplicata a cada troca. Aqui colapsamos a marca
 * repetida via sanitizeProductName, devolvendo o nome que o catálogo usa.
 */
export function resolveTradeInProductName(
  brand: string | null | undefined,
  model: string | null | undefined,
): string {
  const cleanModel = sanitizeProductName((model ?? "").trim(), brand);
  return cleanModel || FALLBACK_NAME;
}
