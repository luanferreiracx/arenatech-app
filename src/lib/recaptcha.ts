import { logger } from "@/lib/logger";

/**
 * Verificação server-side do Google reCAPTCHA v2 (checkbox "Não sou um robô").
 *
 * Porta da lógica do Laravel (AuthController::verifyRecaptcha), adaptada:
 * - Sem `RECAPTCHA_SECRET_KEY` configurada → permite (modo dev/não configurado).
 * - Erro de rede ao falar com o Google → loga e permite (fail-open): uma queda
 *   da API do reCAPTCHA não pode derrubar todos os logins do sistema.
 * - Token ausente com secret configurada → falha (o caller exige o token quando
 *   o desafio adaptativo está ativo).
 *
 * @see docs/decisions/0049-login-recaptcha-2fa.md
 */
const SITEVERIFY_URL = "https://www.google.com/recaptcha/api/siteverify";

type SiteVerifyResponse = {
  success?: boolean;
  "error-codes"?: string[];
};

export function isRecaptchaConfigured(): boolean {
  return Boolean(process.env.RECAPTCHA_SECRET_KEY);
}

export async function verifyRecaptcha(token: string, remoteIp?: string): Promise<boolean> {
  const secret = process.env.RECAPTCHA_SECRET_KEY;
  if (!secret) return true; // não configurado → não bloqueia (dev)
  if (!token) return false; // configurado e exigido, mas sem token → falha

  try {
    const body = new URLSearchParams({ secret, response: token });
    if (remoteIp && remoteIp !== "unknown") body.set("remoteip", remoteIp);

    const res = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      // Não deixa um Google lento travar o login indefinidamente.
      signal: AbortSignal.timeout(5000),
    });
    const data = (await res.json()) as SiteVerifyResponse;
    if (!data.success) {
      logger.warn("reCAPTCHA inválido", { errorCodes: data["error-codes"] ?? [] });
    }
    return data.success === true;
  } catch (error) {
    // Fail-open: indisponibilidade do Google não pode bloquear todos os logins.
    logger.error("Erro ao verificar reCAPTCHA", {
      error: error instanceof Error ? error.message : String(error),
    });
    return true;
  }
}
