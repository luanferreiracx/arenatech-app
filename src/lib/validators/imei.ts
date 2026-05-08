import { z } from "zod";

// ────────────────────────────────────────────────────────────────────────────
// IMEI Validation (Luhn algorithm)
// ────────────────────────────────────────────────────────────────────────────

function isValidLuhn(value: string): boolean {
  let sum = 0;
  let alternate = false;

  for (let i = value.length - 1; i >= 0; i--) {
    let digit = parseInt(value[i]!, 10);

    if (alternate) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }

    sum += digit;
    alternate = !alternate;
  }

  return sum % 10 === 0;
}

export const imeiSchema = z
  .string()
  .length(15, "IMEI deve ter 15 dígitos")
  .regex(/^\d{15}$/, "IMEI deve conter apenas números")
  .refine(isValidLuhn, "IMEI inválido (falha na validação Luhn)");

// ────────────────────────────────────────────────────────────────────────────
// Query IMEI
// ────────────────────────────────────────────────────────────────────────────

export const queryImeiSchema = z.object({
  imei: imeiSchema,
});

export type QueryImeiInput = z.infer<typeof queryImeiSchema>;

// ────────────────────────────────────────────────────────────────────────────
// History
// ────────────────────────────────────────────────────────────────────────────

export const listImeiQueriesSchema = z.object({
  search: z.string().optional(),
  status: z.enum(["pending", "success", "error"]).optional(),
  page: z.number().int().min(0),
  pageSize: z.number().int().min(1).max(100),
});

export type ListImeiQueriesInput = z.infer<typeof listImeiQueriesSchema>;

// ────────────────────────────────────────────────────────────────────────────
// IMEI Result type (from API or mock)
// ────────────────────────────────────────────────────────────────────────────

export interface ImeiResult {
  imei: string;
  valid: boolean;
  brand: string;
  model: string;
  blacklisted: boolean;
  warranty: {
    status: string;
    expiry: string | null;
  };
  carrier: string;
  icloudLock?: boolean;
  activationStatus?: string;
  serial?: string;
}
