/**
 * URL base da aplicação (intranet) usada para construir links absolutos em
 * emails, PDFs e QR codes gerados server-side.
 *
 * Prioridade: NEXT_PUBLIC_APP_URL > NEXTAUTH_URL > erro em produção.
 *
 * Em desenvolvimento, retorna http://localhost:3000 como fallback seguro.
 * Em produção, a ausência de ambas as vars é um erro de configuração —
 * fail-fast evita links silenciosamente quebrados em emails/PDFs.
 */
export function getAppBaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXTAUTH_URL;

  if (!url) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "NEXT_PUBLIC_APP_URL (ou NEXTAUTH_URL) não configurada. " +
          "Defina a URL base da aplicação antes de iniciar em produção.",
      );
    }
    return "http://localhost:3000";
  }

  return url.replace(/\/$/, "");
}
