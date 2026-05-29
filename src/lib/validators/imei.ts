import { z } from "zod";

// ── IMEI Validation (Luhn algorithm) ──

export function isValidLuhn(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 15) return false;

  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let digit = parseInt(digits[digits.length - 1 - i]!, 10);
    if (i % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}

/** Alias for clarity in stock module */
export const validateImei = isValidLuhn;

export const imeiSchema = z
  .string()
  .min(15, "IMEI deve ter 15 digitos")
  .max(15, "IMEI deve ter 15 digitos")
  .regex(/^\d{15}$/, "IMEI deve conter apenas digitos")
  .refine(isValidLuhn, "IMEI invalido (falha na validacao Luhn)");

// ── Identificador de consulta: IMEI (15 digitos) ou Serial Apple (8-17 alfanum) ──

/**
 * Aceita IMEI (15 digitos numericos com Luhn valido) OU Serial Apple
 * (8-17 caracteres alfanumericos). Paridade Laravel ConsultaController.
 */
export function isValidDeviceIdentifier(value: string): boolean {
  const id = value.trim().toUpperCase();
  const isImei = /^\d{15}$/.test(id) && isValidLuhn(id);
  const isSerial = /^[A-Z0-9]{8,17}$/.test(id) && !/^\d{15}$/.test(id);
  return isImei || isSerial;
}

export const deviceIdentifierSchema = z
  .string()
  .trim()
  .min(8, "Informe um IMEI (15 digitos) ou Serial Apple (8-17 caracteres)")
  .max(17, "Identificador muito longo")
  .transform((v) => v.toUpperCase())
  .refine(
    isValidDeviceIdentifier,
    "Deve ser um IMEI (15 digitos com Luhn valido) ou Serial Apple (8-17 alfanumericos)",
  );

// ── Query IMEI/Serial ──

export const queryImeiSchema = z.object({
  identificador: deviceIdentifierSchema,
});
export type QueryImeiInput = z.infer<typeof queryImeiSchema>;

// ── Consulta NF-e (chave de acesso 44 digitos) ──

export const validateNfeSchema = z.object({
  chave: z
    .string()
    .trim()
    .regex(/^\d{44}$/, "Chave de acesso invalida! Deve conter exatamente 44 digitos numericos."),
});
export type ValidateNfeInput = z.infer<typeof validateNfeSchema>;

// ── List Queries ──

export const listImeiQueriesSchema = z.object({
  search: z.string().optional(),
  page: z.number().int().min(0).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
});
export type ListImeiQueriesInput = z.infer<typeof listImeiQueriesSchema>;
