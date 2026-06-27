import { hashSync } from "bcryptjs";

const BCRYPT_COST = 12;

export function hashPassword(password: string): string {
  return hashSync(password, BCRYPT_COST);
}

/** Politica de senha do tenant (espelha TenantSecuritySettings). */
export interface PasswordPolicy {
  minPasswordLength: number;
  requireUppercase: boolean;
  requireNumber: boolean;
  requireSpecialChar: boolean;
}

/**
 * Valida uma senha contra a politica do tenant (D4 da auditoria de config).
 * Pura/sem I/O — testavel. Retorna a mensagem de erro (pt-BR) ou `null` se OK.
 * O chamador carrega a politica (TenantSecuritySettings, com defaults do schema)
 * e lanca um TRPCError BAD_REQUEST com a mensagem quando != null.
 */
export function validatePasswordPolicy(
  password: string,
  policy: PasswordPolicy,
): string | null {
  if (password.length < policy.minPasswordLength) {
    return `A senha deve ter ao menos ${policy.minPasswordLength} caracteres.`;
  }
  if (policy.requireUppercase && !/[A-Z]/.test(password)) {
    return "A senha deve conter ao menos uma letra maiuscula.";
  }
  if (policy.requireNumber && !/[0-9]/.test(password)) {
    return "A senha deve conter ao menos um numero.";
  }
  if (policy.requireSpecialChar && !/[^A-Za-z0-9]/.test(password)) {
    return "A senha deve conter ao menos um caractere especial.";
  }
  return null;
}
