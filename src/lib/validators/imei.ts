import { z } from "zod";

// ── IMEI Validation (Luhn algorithm) ──

function isValidLuhn(value: string): boolean {
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

export const imeiSchema = z
  .string()
  .min(15, "IMEI deve ter 15 digitos")
  .max(15, "IMEI deve ter 15 digitos")
  .regex(/^\d{15}$/, "IMEI deve conter apenas digitos")
  .refine(isValidLuhn, "IMEI invalido (falha na validacao Luhn)");

// ── Query IMEI ──

export const queryImeiSchema = z.object({
  imei: imeiSchema,
});
export type QueryImeiInput = z.infer<typeof queryImeiSchema>;

// ── List Queries ──

export const listImeiQueriesSchema = z.object({
  search: z.string().optional(),
  page: z.number().int().min(0).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
});
export type ListImeiQueriesInput = z.infer<typeof listImeiQueriesSchema>;
