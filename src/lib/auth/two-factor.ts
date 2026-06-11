import { createCipheriv, createDecipheriv, createHash, randomBytes, randomInt } from "node:crypto";
import * as OTPAuth from "otpauth";

/**
 * 2FA TOTP — geração/verificação de códigos, cifragem do segredo em repouso e
 * backup codes de uso único.
 *
 * O segredo TOTP é cifrado com AES-256-GCM antes de ir pro banco. A chave é
 * DERIVADA do NEXTAUTH_SECRET (já presente onde a auth funciona), então 2FA não
 * exige uma nova variável crítica. Rotacionar o NEXTAUTH_SECRET invalida os
 * segredos 2FA (usuários reconfiguram) — trade-off aceito e raro.
 *
 * @see docs/decisions/0049-login-turnstile-2fa.md
 */
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

const TOTP_ISSUER = "Arena Tech";
const TOTP_PERIOD = 30;
const TOTP_DIGITS = 6;
// Janela ±2 (±60s) tolera dessincronia comum entre o relógio do servidor e o do
// app autenticador. Mais que isso indica relógio do servidor fora do ar (corrigir
// NTP), não algo a compensar afrouxando a verificação. Custo de segurança
// desprezível: 5 janelas de 6 dígitos vs. o rate limit por CPF (5/15min).
const TOTP_WINDOW = 2;

const BACKUP_CODE_COUNT = 10;

/** True quando o sistema consegue cifrar segredos 2FA (auth configurada). */
export function isTwoFactorConfigured(): boolean {
  return Boolean(process.env.NEXTAUTH_SECRET);
}

function getEncryptionKey(): Buffer {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error("NEXTAUTH_SECRET não configurado — necessário para cifrar o segredo 2FA.");
  }
  // Deriva uma chave de 32 bytes dedicada ao 2FA (contexto separado da sessão).
  return createHash("sha256").update(`${secret}:two-factor`).digest();
}

/** Cifra o segredo TOTP. Formato: base64(iv):base64(authTag):base64(ciphertext). */
export function encryptSecret(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), authTag.toString("base64"), encrypted.toString("base64")].join(":");
}

export function decryptSecret(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(":");
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Segredo 2FA cifrado em formato inválido.");
  }
  const key = getEncryptionKey();
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, "base64"), {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
}

/** Gera um novo segredo TOTP (base32). */
export function generateTotpSecret(): string {
  return new OTPAuth.Secret({ size: 20 }).base32;
}

function buildTotp(base32Secret: string, accountLabel: string): OTPAuth.TOTP {
  return new OTPAuth.TOTP({
    issuer: TOTP_ISSUER,
    label: accountLabel,
    algorithm: "SHA1",
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD,
    secret: OTPAuth.Secret.fromBase32(base32Secret),
  });
}

/** URI otpauth:// para o QR code do app autenticador. */
export function buildOtpAuthUrl(base32Secret: string, accountLabel: string): string {
  return buildTotp(base32Secret, accountLabel).toString();
}

/** Valida um código TOTP de 6 dígitos contra o segredo (janela ±1). */
export function verifyTotp(base32Secret: string, token: string): boolean {
  const normalized = token.replace(/\s/g, "");
  if (!/^\d{6}$/.test(normalized)) return false;
  const delta = buildTotp(base32Secret, "x").validate({ token: normalized, window: TOTP_WINDOW });
  return delta !== null;
}

const BACKUP_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sem chars ambíguos

function randomBackupCode(): string {
  const pick = () =>
    Array.from({ length: 5 }, () => BACKUP_CODE_ALPHABET[randomInt(BACKUP_CODE_ALPHABET.length)]).join("");
  return `${pick()}-${pick()}`;
}

export function hashBackupCode(code: string): string {
  return createHash("sha256").update(code.replace(/\s|-/g, "").toUpperCase()).digest("hex");
}

/**
 * Gera N backup codes. Retorna os códigos em texto puro (mostrados UMA vez ao
 * usuário) e seus hashes (persistidos). O texto puro nunca é armazenado.
 */
export function generateBackupCodes(count = BACKUP_CODE_COUNT): { codes: string[]; hashes: string[] } {
  const codes = Array.from({ length: count }, randomBackupCode);
  return { codes, hashes: codes.map(hashBackupCode) };
}

/**
 * Verifica um backup code contra a lista de hashes. Se bater, retorna a lista
 * SEM o hash consumido (uso único). Senão, retorna null.
 */
export function consumeBackupCode(code: string, hashes: string[]): string[] | null {
  const target = hashBackupCode(code);
  if (!hashes.includes(target)) return null;
  return hashes.filter((h) => h !== target);
}
