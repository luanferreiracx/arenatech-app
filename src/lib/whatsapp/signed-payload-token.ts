import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Token HMAC-assinado que CARREGA um payload JSON arbitrario (stateless, sem
 * Redis). Para PDFs TRANSIENTES servidos publicamente a Meta Cloud — ex: a
 * simulacao de parcelamento, que nao e persistida em nenhuma entidade, entao
 * nao da pra referenciar por id (como faz public-pdf-token.ts com orderId).
 *
 * O payload + exp viajam no token, assinados por HMAC-SHA256. So serve para
 * dados pequenos (uma simulacao ~1KB). Mesma SECRET/encoding do public-pdf-token.
 */

const SECRET = () =>
  process.env.WHATSAPP_MEDIA_SECRET ??
  process.env.NEXTAUTH_SECRET ??
  "dev-insecure-media-secret";

function b64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function b64urlDecode(input: string): Buffer {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

/** Cria token assinado embutindo `data` + expiracao. */
export function createSignedPayloadToken<T>(data: T, ttlMs: number): string {
  const envelope = { data, exp: Date.now() + ttlMs };
  const body = b64url(JSON.stringify(envelope));
  const sig = b64url(createHmac("sha256", SECRET()).update(body).digest());
  return `${body}.${sig}`;
}

/** Valida assinatura + expiracao e retorna o payload, ou null. */
export function verifySignedPayloadToken<T>(token: string): T | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expected = b64url(createHmac("sha256", SECRET()).update(body!).digest());
  if (sig!.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(sig!), Buffer.from(expected))) return null;
  try {
    const envelope = JSON.parse(b64urlDecode(body!).toString()) as {
      data: T;
      exp: number;
    };
    if (envelope.exp < Date.now()) return null;
    return envelope.data;
  } catch {
    return null;
  }
}
