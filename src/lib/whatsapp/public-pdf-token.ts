import crypto from "node:crypto";

/**
 * Gera um token HMAC para acesso publico temporario ao PDF da OS via WhatsApp.
 *
 * A Meta precisa baixar o PDF sem auth (header DOCUMENT do template). Este
 * token e curto, com prazo de 1h e escopo por OS (tenant + orderId).
 *
 * Formato: base64url(payload).base64url(HMAC-SHA256(payload))
 * Payload: `${tenantId}.${orderId}.${expiresAt}.${kind}`
 *
 * Em prod, AUTH_SECRET (ou NEXTAUTH_SECRET) e obrigatorio — sem ele,
 * `getSecret()` lanca em runtime ao tentar assinar/verificar. Em dev/test,
 * fallback `dev-secret` permite rodar local sem configurar.
 */
function getSecret(): string {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "AUTH_SECRET (ou NEXTAUTH_SECRET) ausente em prod — assinatura de PDF publico nao pode ser gerada com fallback inseguro.",
      );
    }
    return "dev-secret";
  }
  return secret;
}

/** Tipo do documento sendo entregado via WhatsApp.
 * - "receipt": recibo final da venda
 * - "delivery": termo de entrega (inclui bloco de responsabilidade quando ha upgrade)
 * - "purchase_term": termo de responsabilidade de compra de aparelho (devicePurchase) */
export type PublicPdfKind = "receipt" | "delivery" | "purchase_term";

export interface PublicPdfTokenPayload {
  tenantId: string;
  orderId: string;
  expiresAt: number; // epoch ms
  kind: PublicPdfKind;
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", getSecret()).update(payload).digest("base64url");
}

export function createPublicPdfToken(
  tenantId: string,
  orderId: string,
  ttlMs = 60 * 60 * 1000,
  kind: PublicPdfKind = "receipt",
): string {
  const expiresAt = Date.now() + ttlMs;
  const payload = `${tenantId}.${orderId}.${expiresAt}.${kind}`;
  const payloadB64 = Buffer.from(payload).toString("base64url");
  const sig = sign(payload);
  return `${payloadB64}.${sig}`;
}

export function verifyPublicPdfToken(token: string): PublicPdfTokenPayload | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sig] = parts;
  if (!payloadB64 || !sig) return null;

  let payload: string;
  try {
    payload = Buffer.from(payloadB64, "base64url").toString("utf8");
  } catch {
    return null;
  }

  const expected = sign(payload);
  // timing-safe compare
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  const split = payload.split(".");
  const [tenantId, orderId, expiresAtStr, kindRaw] = split;
  if (!tenantId || !orderId || !expiresAtStr) return null;
  const expiresAt = Number(expiresAtStr);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return null;

  // Tokens antigos (sem kind) caem em "receipt" por compatibilidade.
  const kind: PublicPdfKind =
    kindRaw === "delivery"
      ? "delivery"
      : kindRaw === "purchase_term"
        ? "purchase_term"
        : "receipt";

  return { tenantId, orderId, expiresAt, kind };
}
