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
