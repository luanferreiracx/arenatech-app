import { z } from "zod";
import { normalizeCpf, validateCpf } from "./cpf";

// ────────────────────────────────────────────────────────────────────────────
// CNPJ validation
// ────────────────────────────────────────────────────────────────────────────

export function normalizeCnpj(cnpj: string): string {
  return cnpj.replace(/\D/g, "");
}

export function validateCnpj(cnpj: string): boolean {
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(digits)) return false;

  const calcDigit = (nums: string, weights: number[]) => {
    const sum = weights.reduce((acc, w, i) => acc + Number(nums[i]) * w, 0);
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

  const d1 = calcDigit(digits, w1);
  if (d1 !== Number(digits[12])) return false;

  const d2 = calcDigit(digits, w2);
  if (d2 !== Number(digits[13])) return false;

  return true;
}

export const cnpjSchema = z
  .string()
  .min(1, "CNPJ obrigatório")
  .transform(normalizeCnpj)
  .refine(validateCnpj, { message: "CNPJ inválido" });

// ────────────────────────────────────────────────────────────────────────────
// Address
// ────────────────────────────────────────────────────────────────────────────

const addressSchema = z.object({
  street: z.string().optional(),
  number: z.string().optional(),
  complement: z.string().optional(),
  neighborhood: z.string().optional(),
  city: z.string().optional(),
  state: z.string().max(2).optional(),
  zip: z.string().optional(),
});

// ────────────────────────────────────────────────────────────────────────────
// Customer
// ────────────────────────────────────────────────────────────────────────────

export const createCustomerSchema = z
  .object({
    type: z.enum(["PF", "PJ"]).default("PF"),
    name: z.string().min(2).max(200),
    cpf: z.string().optional(),
    cnpj: z.string().optional(),
    email: z.string().email().optional().or(z.literal("")),
    phone: z.string().optional(),
    phone2: z.string().optional(),
    address: addressSchema.optional(),
    notes: z.string().optional(),
    consentAt: z.date().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.type === "PF" && data.cpf) {
      const normalized = normalizeCpf(data.cpf);
      if (!validateCpf(normalized)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "CPF inválido", path: ["cpf"] });
      }
    }
    if (data.type === "PJ" && data.cnpj) {
      const normalized = normalizeCnpj(data.cnpj);
      if (!validateCnpj(normalized)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "CNPJ inválido", path: ["cnpj"] });
      }
    }
  });

export const updateCustomerSchema = createCustomerSchema.partial();

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Customer list filters
// ────────────────────────────────────────────────────────────────────────────

export const listCustomersSchema = z.object({
  search: z.string().optional(),
  type: z.enum(["PF", "PJ"]).optional(),
  page: z.number().int().min(0).default(0),
  pageSize: z.number().int().min(1).max(100).default(20),
  includeDeleted: z.boolean().default(false),
});

export type ListCustomersInput = z.infer<typeof listCustomersSchema>;

// ────────────────────────────────────────────────────────────────────────────
// CustomerInterest
// ────────────────────────────────────────────────────────────────────────────

export const createInterestSchema = z.object({
  customerId: z.string().uuid(),
  description: z.string().min(1).max(500),
  followUpAt: z.date().optional(),
  resolved: z.boolean().default(false),
});

export const updateInterestSchema = createInterestSchema.omit({ customerId: true }).partial();

export type CreateInterestInput = z.infer<typeof createInterestSchema>;
export type UpdateInterestInput = z.infer<typeof updateInterestSchema>;
