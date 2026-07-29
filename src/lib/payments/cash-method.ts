/**
 * Fonte ÚNICA da pergunta "esta forma de pagamento é dinheiro?".
 *
 * Antes a resposta existia em dois lugares que discordavam:
 *
 * - `sale.ts:isCashMethod` normalizava acento/caixa/espaço, então `"Dinheiro"`,
 *   `" dinheiro "`, `"cash"` e `"especie"` exigiam caixa aberto;
 * - `cash-session.service.ts:CASH_DRAWER_METHODS` comparava com o literal
 *   `"dinheiro"`, então nada disso entrava no saldo esperado da gaveta.
 *
 * O resultado era dinheiro que o sistema obrigava a receber no caixa e depois
 * não contava na conferência — sobra fantasma no fechamento.
 *
 * E nenhuma das duas resolvia o caso mais comum: o PDV manda
 * `PaymentMethod.code ?? PaymentMethod.id`, e a forma "Dinheiro" nasce **sem
 * code** no cadastro padrão de tenant novo. Ou seja, o que chega é um UUID.
 * Medido em 2026-07-29: 5 dos 6 tenants com "Dinheiro" cadastrado tinham
 * `code = NULL`. O `enrichPaymentDetailsLabels` já resolvia o UUID para
 * EXIBIÇÃO; a conta do dinheiro nunca recebeu o mesmo tratamento.
 */

/** Token canônico de cada tipo de forma cadastrada, quando ela não tem `code`. */
const TOKEN_BY_PAYMENT_METHOD_TYPE: Record<string, string> = {
  CASH: "dinheiro",
  PIX: "pix",
  CREDIT_CARD: "cartao_credito",
  DEBIT_CARD: "cartao_debito",
  BANK_TRANSFER: "transferencia",
  STORE_CREDIT: "crediario",
  OTHER: "outros",
};

/** Grafias que significam dinheiro em espécie. */
const CASH_TOKENS = new Set(["dinheiro", "cash", "money", "especie"]);

/**
 * Correção deliberada da gaveta pelo gerente (`manualAdjustment`). Não é uma
 * forma de pagamento — é o gerente somando ou tirando dinheiro do físico — mas
 * move a gaveta como se fosse.
 */
export const MANUAL_ADJUSTMENT_METHOD = "ajuste_manual";

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Tira acento, espaço nas pontas e caixa — `" Dinheiro "` e `"dinheiro"` viram o mesmo. */
export function normalizeMethodToken(method: string): string {
  return method
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

/** A forma é dinheiro em espécie? Não resolve UUID — use `canonicalMethodToken` antes. */
export function isCashMethodToken(method: string | null | undefined): boolean {
  if (!method) return false;
  return CASH_TOKENS.has(normalizeMethodToken(method));
}

/**
 * A forma movimenta a GAVETA física? Dinheiro em espécie e ajuste manual, só.
 * Cartão/PIX/DePix não passam pela gaveta: uma despesa paga no cartão não
 * reduz o dinheiro contado no fechamento.
 */
export function affectsCashDrawer(method: string | null | undefined): boolean {
  if (!method) return false;
  const token = normalizeMethodToken(method);
  return CASH_TOKENS.has(token) || token === MANUAL_ADJUSTMENT_METHOD;
}

/** O valor gravado é o id de um PaymentMethod cadastrado (em vez de um code)? */
export function looksLikePaymentMethodId(method: string | null | undefined): boolean {
  return !!method && UUID_PATTERN.test(method);
}

/**
 * Token canônico para uma forma cadastrada: o `code` do tenant quando existe,
 * senão o derivado do tipo. É o que deve ser PERSISTIDO em
 * `cash_movements.payment_method` — o UUID cru não diz nada para a conta do
 * dinheiro nem para o rótulo na tela de fechamento.
 */
export function canonicalMethodToken(paymentMethod: {
  code: string | null;
  type: string;
}): string {
  const fromCode = paymentMethod.code?.trim();
  if (fromCode) return normalizeMethodToken(fromCode);
  return TOKEN_BY_PAYMENT_METHOD_TYPE[paymentMethod.type] ?? "outros";
}
