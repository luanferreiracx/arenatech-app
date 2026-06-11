import { logger } from "@/lib/logger";

/**
 * Verificação server-side do Cloudflare Turnstile (desafio anti-bot do login).
 *
 * - Sem `TURNSTILE_SECRET_KEY` configurada → permite (modo dev/não configurado).
 * - Erro de rede/timeout ao falar com o Cloudflare → loga e permite (fail-open):
 *   uma queda da API do Turnstile não pode derrubar todos os logins do sistema.
 * - Token ausente com secret configurada → falha (o caller exige o token quando
 *   o desafio adaptativo está ativo).
 *
 * O token é de uso único e expira em 5min; um replay retorna `timeout-or-duplicate`.
 *
 * @see docs/decisions/0049-login-turnstile-2fa.md
 */
const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

type SiteVerifyResponse = {
  success?: boolean;
  "error-codes"?: string[];
};

export function isTurnstileConfigured(): boolean {
  return Boolean(process.env.TURNSTILE_SECRET_KEY);
}

export async function verifyTurnstile(token: string, remoteIp?: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true; // não configurado → não bloqueia (dev)
  if (!token) return false; // configurado e exigido, mas sem token → falha

  try {
    const body = new URLSearchParams({ secret, response: token });
    if (remoteIp && remoteIp !== "unknown") body.set("remoteip", remoteIp);

    const res = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      // Não deixa um Cloudflare lento travar o login indefinidamente.
      signal: AbortSignal.timeout(5000),
    });
    const data = (await res.json()) as SiteVerifyResponse;
    if (!data.success) {
      logger.warn("Turnstile inválido", { errorCodes: data["error-codes"] ?? [] });
    }
    return data.success === true;
  } catch (error) {
    // Fail-open: indisponibilidade do Cloudflare não pode bloquear todos os logins.
    logger.error("Erro ao verificar Turnstile", {
      error: error instanceof Error ? error.message : String(error),
    });
    return true;
  }
}
