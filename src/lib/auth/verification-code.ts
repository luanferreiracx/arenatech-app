/**
 * Funções puras de código de verificação (OTP) para o onboarding NO-KYC
 * (ADR 0050). Sem I/O — geração, hash e comparação. A orquestração com banco e
 * envio (email/WhatsApp) fica em `src/server/services/verification.service.ts`.
 *
 * O código é numérico de 6 dígitos. Guardamos apenas o HASH SHA-256 (nunca o
 * código em claro), comparado em tempo constante. Mesma família de primitivas
 * usadas em `src/lib/auth/two-factor.ts`.
 */
import { createHash, randomInt, timingSafeEqual } from "node:crypto";

/** Quantidade de dígitos do código OTP. */
export const VERIFICATION_CODE_LENGTH = 6;

/** Validade padrão do código, em minutos (alinhada ao template da Meta). */
export const VERIFICATION_CODE_TTL_MINUTES = 10;

/** Máximo de tentativas de validação por código antes de invalidá-lo. */
export const VERIFICATION_MAX_ATTEMPTS = 5;

/** Gera um código numérico de 6 dígitos (com zeros à esquerda preservados). */
export function generateVerificationCode(): string {
  const max = 10 ** VERIFICATION_CODE_LENGTH; // 1_000_000
  return String(randomInt(0, max)).padStart(VERIFICATION_CODE_LENGTH, "0");
}

/** Hash SHA-256 (hex) do código. Só o hash é persistido. */
export function hashVerificationCode(code: string): string {
  return createHash("sha256").update(normalizeCode(code)).digest("hex");
}

/** Remove espaços/traços e mantém só dígitos. */
export function normalizeCode(code: string): string {
  return code.replace(/\D/g, "");
}

/** Compara um código informado contra o hash guardado, em tempo constante. */
export function verifyCodeHash(inputCode: string, storedHash: string): boolean {
  const inputHash = hashVerificationCode(inputCode);
  const a = Buffer.from(inputHash, "hex");
  const b = Buffer.from(storedHash, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Instante de expiração a partir de agora (default: TTL padrão). */
export function expiresAtFromNow(
  minutes: number = VERIFICATION_CODE_TTL_MINUTES,
  now: Date = new Date(),
): Date {
  return new Date(now.getTime() + minutes * 60_000);
}
