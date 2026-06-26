import { timingSafeEqual } from "node:crypto";
import { logger } from "@/lib/logger";

/**
 * Valida a auth do webhook da Eulen (docs.eulen.app).
 *
 * A Eulen envia `Authorization: Basic base64(username:secret)` — o `secret` e o
 * que registramos via Bot do Telegram (`/registerwebhook <type> <url> <secret>`).
 * Validamos SO a senha (parte apos o 1o `:`); o username e ignorado, o que nos
 * deixa robustos a qualquer valor que a Eulen use (partner, sub, etc).
 *
 * Comparacao em tempo constante. Fail-closed: sem `EULEN_WEBHOOK_SECRET` em
 * producao, rejeita (igual ao padrao do webhook LWK). Em dev, processa com warn.
 */
export function verifyEulenWebhookAuth(authHeader: string | null): {
  ok: boolean;
  reason?: string;
} {
  const secret = process.env.EULEN_WEBHOOK_SECRET;

  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      logger.error("Eulen webhook: EULEN_WEBHOOK_SECRET ausente em producao — rejeitando");
      return { ok: false, reason: "secret_not_configured" };
    }
    logger.warn("Eulen webhook: sem EULEN_WEBHOOK_SECRET — processando sem auth (dev)");
    return { ok: true };
  }

  if (!authHeader || !authHeader.startsWith("Basic ")) {
    return { ok: false, reason: "missing_basic_auth" };
  }

  let decoded: string;
  try {
    decoded = Buffer.from(authHeader.slice("Basic ".length).trim(), "base64").toString("utf8");
  } catch {
    return { ok: false, reason: "invalid_base64" };
  }

  // username:secret — pega tudo apos o 1o `:` (o secret pode conter `:`).
  const sepIndex = decoded.indexOf(":");
  const provided = sepIndex >= 0 ? decoded.slice(sepIndex + 1) : decoded;

  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  if (a.length !== b.length || a.length === 0 || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "secret_mismatch" };
  }
  return { ok: true };
}
