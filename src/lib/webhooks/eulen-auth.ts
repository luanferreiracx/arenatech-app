import { timingSafeEqual } from "node:crypto";
import { logger } from "@/lib/logger";

/** Comparacao de senha em tempo constante (evita timing attack). */
function secretMatches(candidate: string, secret: string): boolean {
  const a = Buffer.from(candidate);
  const b = Buffer.from(secret);
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

/**
 * Valida a auth do webhook da Eulen (docs.eulen.app).
 *
 * O `secret` e o que registramos via Bot do Telegram
 * (`/registerwebhook <type> <url> <secret>`). A doc da Eulen mostra o header de
 * DOIS jeitos, entao aceitamos os tres formatos plausiveis (todos comparados em
 * tempo constante contra o secret):
 *   1. `Basic <secret-cru>`            — o token literal (exemplo principal da doc)
 *   2. `Basic base64(username:secret)` — padrao HTTP Basic (username ignorado)
 *   3. `Basic base64(secret)`          — secret sozinho em base64
 *
 * Fail-closed: sem `EULEN_WEBHOOK_SECRET` em producao, rejeita (igual ao padrao
 * do webhook LWK). Em dev, processa com warn.
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

  const raw = authHeader.slice("Basic ".length).trim();

  // Candidatos a senha, do mais simples ao padrao HTTP Basic.
  const candidates = new Set<string>();
  candidates.add(raw); // 1. secret cru

  let decoded: string | null = null;
  try {
    decoded = Buffer.from(raw, "base64").toString("utf8");
  } catch {
    decoded = null;
  }
  if (decoded) {
    candidates.add(decoded); // 3. base64(secret)
    const sepIndex = decoded.indexOf(":");
    if (sepIndex >= 0) {
      candidates.add(decoded.slice(sepIndex + 1)); // 2. base64(username:secret)
    }
  }

  for (const candidate of candidates) {
    if (secretMatches(candidate, secret)) return { ok: true };
  }
  return { ok: false, reason: "secret_mismatch" };
}
