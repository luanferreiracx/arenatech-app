import { timingSafeEqual } from "node:crypto";

/**
 * Compara duas strings em tempo constante. Retorna `false` quando os
 * comprimentos diferem (sem antes consumir bytes da string longa) e usa
 * `timingSafeEqual` quando coincidem.
 *
 * Usado para validar tokens/segredos de webhooks — evita o ataque classico
 * de byte-by-byte em `a === b` ou `a.localeCompare(b)`.
 */
export function timingSafeEqualString(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  if (a.length === 0) return true;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return timingSafeEqual(bufA, bufB);
}

/**
 * Variante para comparar um header (`Bearer xxx` ou `xxx`) com o token
 * esperado. Aceita ambos os formatos no header recebido.
 */
export function timingSafeEqualBearer(
  receivedHeader: string | null | undefined,
  expectedToken: string,
): boolean {
  if (!receivedHeader || !expectedToken) return false;
  const bearer = `Bearer ${expectedToken}`;
  // Estrategia: compara contra "Bearer X" e contra "X" em tempo constante
  // (`||` so encurta apos as duas comparacoes terem rodado).
  const matchBearer = timingSafeEqualString(receivedHeader, bearer);
  const matchRaw = timingSafeEqualString(receivedHeader, expectedToken);
  return matchBearer || matchRaw;
}
