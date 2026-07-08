import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Cifragem de segredos textuais em repouso (AES-256-GCM), para valores que o
 * servidor precisa recuperar em claro depois (ex.: secret HMAC de webhook de
 * saída). Mesmo esquema do 2FA (`lib/auth/two-factor.ts`): chave derivada do
 * NEXTAUTH_SECRET, então não exige uma variável crítica nova. O `context` separa
 * os domínios de uso (dois valores iguais cifrados com contextos diferentes não
 * se decifram cruzado).
 *
 * Formato do ciphertext: base64(iv):base64(authTag):base64(data) — 3 partes.
 * Um valor que NÃO tem esse formato é tratado como LEGADO EM CLARO por
 * `openSecret` (retorna como está), permitindo transição sem quebrar dados
 * existentes enquanto o backfill não roda.
 */
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function keyFor(context: string): Buffer {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error("NEXTAUTH_SECRET não configurado — necessário para cifrar segredos em repouso.");
  }
  return createHash("sha256").update(`${secret}:${context}`).digest();
}

/** True quando dá pra cifrar (auth configurada). */
export function canSealSecret(): boolean {
  return Boolean(process.env.NEXTAUTH_SECRET);
}

/** Um payload tem o formato cifrado (iv:tag:data em base64)? */
export function isSealed(value: string): boolean {
  const parts = value.split(":");
  if (parts.length !== 3) return false;
  return parts.every((p) => p.length > 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(p));
}

/** Cifra `plaintext` no domínio `context`. */
export function sealSecret(plaintext: string, context: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, keyFor(context), iv, { authTagLength: AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), authTag.toString("base64"), encrypted.toString("base64")].join(":");
}

/**
 * Decifra um valor produzido por `sealSecret`. Se o valor NÃO estiver no formato
 * cifrado, assume LEGADO EM CLARO e o retorna como está (transição). Lança apenas
 * se o valor parece cifrado mas a decifragem falha (chave errada/corrupção).
 */
export function openSecret(value: string, context: string): string {
  if (!isSealed(value)) return value; // legado em claro
  const [ivB64, tagB64, dataB64] = value.split(":");
  const decipher = createDecipheriv(ALGORITHM, keyFor(context), Buffer.from(ivB64!, "base64"), {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(Buffer.from(tagB64!, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64!, "base64")), decipher.final()]).toString("utf8");
}
