import { randomBytes } from "node:crypto";

/**
 * Gera um token publico curto e nao previsivel para URLs (link de OS,
 * link de orcamento, etc.).
 *
 * Usa `crypto.randomBytes` (CSPRNG) — NUNCA `Math.random`, que e previsivel
 * e permitiria adivinhar links a partir de uma seed conhecida.
 *
 * O alfabeto e base32-crockford (sem `i`, `l`, `o`, `u`) para evitar
 * confusao visual no compartilhamento manual. Cada caractere carrega ~5
 * bits de entropia.
 *
 * Para `length=12` => ~60 bits — suficiente para uso publico curto.
 * Para `length=16` => ~80 bits — usado em links de orcamento.
 */
const ALPHABET = "abcdefghjkmnpqrstvwxyz0123456789"; // 32 chars

export function generatePublicToken(length: number): string {
  if (length <= 0) return "";
  const bytes = randomBytes(length);
  let result = "";
  for (let i = 0; i < length; i++) {
    result += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return result;
}
