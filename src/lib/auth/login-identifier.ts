/**
 * Resolução do identificador de login (ADR 0050, Fase 2).
 *
 * O login é um campo único: se contém "@" tratamos como EMAIL (tenant NO-KYC),
 * senão como CPF (tenant KYC). Função pura — sem I/O — para ser testável e
 * reutilizável entre o `authorize` (NextAuth) e a UI.
 */
import { z } from "zod";
import { normalizeCpf, validateCpf } from "@/lib/validators/cpf";

const emailSchema = z.string().email().max(200);

export type LoginIdentifier =
  | { kind: "cpf"; value: string }
  | { kind: "email"; value: string };

/**
 * Interpreta o valor digitado no campo de login.
 * - Contém "@" → valida como email (lowercased/trim).
 * - Caso contrário → valida CPF (dígitos verificadores) e normaliza p/ dígitos.
 * Retorna `null` se o valor for inválido para o formato detectado.
 */
export function resolveLoginIdentifier(raw: unknown): LoginIdentifier | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (trimmed.includes("@")) {
    const parsed = emailSchema.safeParse(trimmed.toLowerCase());
    return parsed.success ? { kind: "email", value: parsed.data } : null;
  }

  if (!validateCpf(trimmed)) return null;
  return { kind: "cpf", value: normalizeCpf(trimmed) };
}

/**
 * Chave do rate-limit/lockout de login — FONTE ÚNICA usada por `authorize`
 * (registra as falhas) E por `loginAction` (lê para decidir o desafio Turnstile).
 * Antes cada lado montava a chave à mão de forma DIFERENTE (`login:cpf:<x>` vs
 * `login:<x>`), então o captcha adaptativo lia um balde vazio e NUNCA disparava —
 * o que deixava o lockout de 15min alcançável por um atacante (DoS por CPF).
 */
export function loginRateLimitKey(identifier: LoginIdentifier): string {
  return `login:${identifier.kind}:${identifier.value}`;
}

/** Mascara o identificador para logs (não vaza CPF/email completos). */
export function maskIdentifier(identifier: LoginIdentifier): string {
  if (identifier.kind === "cpf") return `${identifier.value.slice(0, 3)}***`;
  const [user, domain] = identifier.value.split("@");
  return `${(user ?? "").slice(0, 2)}***@${domain ?? ""}`;
}
