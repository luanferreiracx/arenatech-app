/**
 * Escapa caracteres especiais HTML para evitar injecao XSS quando o valor
 * vai ser interpolado dentro de um template HTML (e-mail, PDF, etc.).
 *
 * Use sempre que renderizar input de usuario (nome, e-mail, link) em HTML.
 */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Converte um corpo HTML de e-mail na alternativa em texto puro.
 *
 * E-mail so-HTML e um dos sinais de spam mais fortes que existem — o Outlook e
 * o Gmail penalizam pesado quem manda `multipart` sem a parte `text/plain`.
 * Todo e-mail que sai daqui leva as duas partes; ver `sendEmail`.
 *
 * Links viram `texto (url)` — senao o endereco de reset de senha sumiria da
 * versao em texto.
 */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, "")
    .replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, "$2 ($1)")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|tr|li|table)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}
