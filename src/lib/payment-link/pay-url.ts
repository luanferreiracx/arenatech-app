/**
 * URL pública do link de pagamento e o contrato do valor pré-preenchido.
 *
 * O valor viaja na query string do MESMO link fixo do tenant — é isso que
 * permite "cobrança com valor" sem criar um registro por cobrança.
 *
 * Módulo puro de propósito: quem monta a URL (router) e quem a lê (página
 * pública) precisam concordar no nome do parâmetro e na unidade. Duplicar essa
 * regra nos dois lados é como se cria divergência silenciosa — a URL montaria
 * centavos e a tela leria reais, sem erro nenhum aparecer.
 */

/** Nome do parâmetro na URL. Em português porque a URL é vista pelo cliente. */
export const PAY_AMOUNT_PARAM = "valor";

/**
 * Monta `/pay/<token>` com o valor opcional.
 *
 * O valor vai em REAIS na URL (`?valor=150.50`), não em centavos: quem lê é uma
 * pessoa, e `?valor=15050` seria confuso a ponto de gerar cobrança errada por
 * cópia manual.
 */
export function buildPayUrl(baseUrl: string, token: string, amountCents?: number): string {
  const url = `${baseUrl.replace(/\/$/, "")}/pay/${token}`;
  if (amountCents == null) return url;
  return `${url}?${PAY_AMOUNT_PARAM}=${(amountCents / 100).toFixed(2)}`;
}

/**
 * Lê o valor da URL e devolve em CENTAVOS, ou `null` se ausente/inválido.
 *
 * Rejeita em vez de arredondar quando o formato não bate: um valor malformado
 * numa cobrança tem de aparecer como "informe o valor", nunca virar um número
 * plausível porém errado.
 */
export function parsePayAmountCents(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  // Aceita "150", "150.50" e "150,50" — vírgula porque é o separador que o
  // operador brasileiro digita ao editar a URL à mão.
  if (!/^\d+([.,]\d{1,2})?$/.test(trimmed)) return null;
  const cents = Math.round(Number(trimmed.replace(",", ".")) * 100);
  return Number.isFinite(cents) && cents > 0 ? cents : null;
}
