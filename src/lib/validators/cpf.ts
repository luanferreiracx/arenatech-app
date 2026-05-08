import { z } from "zod";

/**
 * Remove all non-digit characters from a CPF string.
 */
export function normalizeCpf(cpf: string): string {
  return cpf.replace(/\D/g, "");
}

/**
 * Validate a CPF using the standard Brazilian verification digit algorithm.
 * Accepts both formatted (xxx.xxx.xxx-xx) and raw (11 digits) strings.
 */
export function validateCpf(cpf: string): boolean {
  const digits = normalizeCpf(cpf);

  if (digits.length !== 11) return false;

  // Reject all-same-digit CPFs (e.g. 111.111.111-11)
  if (/^(\d)\1{10}$/.test(digits)) return false;

  // Validate first verification digit
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += Number(digits[i]) * (10 - i);
  }
  let remainder = (sum * 10) % 11;
  if (remainder === 10) remainder = 0;
  if (remainder !== Number(digits[9])) return false;

  // Validate second verification digit
  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += Number(digits[i]) * (11 - i);
  }
  remainder = (sum * 10) % 11;
  if (remainder === 10) remainder = 0;
  if (remainder !== Number(digits[10])) return false;

  return true;
}

/**
 * Zod schema for CPF. Accepts formatted or raw input, normalizes to 11 digits, validates.
 */
export const cpfSchema = z
  .string()
  .min(1, "CPF obrigatório")
  .transform(normalizeCpf)
  .refine(validateCpf, { message: "CPF inválido" });
