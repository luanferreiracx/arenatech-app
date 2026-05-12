import { z } from "zod";
import { normalizeCpf, validateCpf } from "@/lib/validators/cpf";

// ── CNPJ validation ──

export function normalizeCnpj(cnpj: string): string {
  return cnpj.replace(/\D/g, "");
}

export function validateCnpj(cnpj: string): boolean {
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(digits)) return false;

  // First verification digit
  const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += Number(digits[i]) * weights1[i]!;
  }
  let remainder = sum % 11;
  const d1 = remainder < 2 ? 0 : 11 - remainder;
  if (Number(digits[12]) !== d1) return false;

  // Second verification digit
  const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  sum = 0;
  for (let i = 0; i < 13; i++) {
    sum += Number(digits[i]) * weights2[i]!;
  }
  remainder = sum % 11;
  const d2 = remainder < 2 ? 0 : 11 - remainder;
  if (Number(digits[13]) !== d2) return false;

  return true;
}

export const cnpjSchema = z
  .string()
  .min(1, "CNPJ obrigatorio")
  .transform(normalizeCnpj)
  .refine(validateCnpj, { message: "CNPJ invalido" });

// ── Address schema ──

export const addressSchema = z.object({
  cep: z.string().max(8).optional(),
  logradouro: z.string().max(200).optional(),
  numero: z.string().max(20).optional(),
  complemento: z.string().max(100).optional(),
  bairro: z.string().max(100).optional(),
  cidade: z.string().max(100).optional(),
  uf: z.string().max(2).optional(),
});

export type AddressData = z.infer<typeof addressSchema>;

// ── Customer type ──

const customerTypeSchema = z.enum(["PF", "PJ"]);

// ── Create customer ──

export const createCustomerSchema = z
  .object({
    type: customerTypeSchema,
    name: z.string().min(2, "Nome deve ter ao menos 2 caracteres").max(200),
    cpf: z.string().optional(),
    cnpj: z.string().optional(),
    email: z.string().email("Email invalido").max(200).optional().or(z.literal("")),
    phone: z.string().max(11).optional(),
    phone2: z.string().max(11).optional(),
    birthDate: z.string().optional(),
    address: addressSchema.optional(),
    notes: z.string().max(2000).optional(),
    consentLgpd: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.type === "PF") {
      if (!data.cpf || data.cpf.trim() === "") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "CPF obrigatorio para Pessoa Fisica",
          path: ["cpf"],
        });
      } else {
        const normalized = normalizeCpf(data.cpf);
        if (!validateCpf(normalized)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "CPF invalido",
            path: ["cpf"],
          });
        }
      }
    }
    if (data.type === "PJ") {
      if (!data.cnpj || data.cnpj.trim() === "") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "CNPJ obrigatorio para Pessoa Juridica",
          path: ["cnpj"],
        });
      } else {
        const normalized = normalizeCnpj(data.cnpj);
        if (!validateCnpj(normalized)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "CNPJ invalido",
            path: ["cnpj"],
          });
        }
      }
    }
  });

export type CreateCustomerInput = z.input<typeof createCustomerSchema>;

// ── Update customer ──

export const updateCustomerSchema = z
  .object({
    id: z.string().uuid(),
    type: customerTypeSchema,
    name: z.string().min(2, "Nome deve ter ao menos 2 caracteres").max(200),
    cpf: z.string().optional(),
    cnpj: z.string().optional(),
    email: z.string().email("Email invalido").max(200).optional().or(z.literal("")),
    phone: z.string().max(11).optional(),
    phone2: z.string().max(11).optional(),
    birthDate: z.string().optional(),
    address: addressSchema.optional(),
    notes: z.string().max(2000).optional(),
    consentLgpd: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.type === "PF") {
      if (!data.cpf || data.cpf.trim() === "") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "CPF obrigatorio para Pessoa Fisica",
          path: ["cpf"],
        });
      } else {
        const normalized = normalizeCpf(data.cpf);
        if (!validateCpf(normalized)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "CPF invalido",
            path: ["cpf"],
          });
        }
      }
    }
    if (data.type === "PJ") {
      if (!data.cnpj || data.cnpj.trim() === "") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "CNPJ obrigatorio para Pessoa Juridica",
          path: ["cnpj"],
        });
      } else {
        const normalized = normalizeCnpj(data.cnpj);
        if (!validateCnpj(normalized)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "CNPJ invalido",
            path: ["cnpj"],
          });
        }
      }
    }
  });

export type UpdateCustomerInput = z.input<typeof updateCustomerSchema>;

// ── List customers ──

export const listCustomersSchema = z.object({
  search: z.string().optional(),
  type: z.enum(["PF", "PJ", "ALL"]).optional(),
  includeDeleted: z.boolean().optional(),
  page: z.number().int().min(0).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
  sortBy: z.enum(["name", "createdAt"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
});

export type ListCustomersInput = z.infer<typeof listCustomersSchema>;

// ── Interest schemas ──

export const createInterestSchema = z.object({
  customerId: z.string().uuid(),
  description: z.string().min(1, "Descricao obrigatoria").max(1000),
  followUpAt: z.string().optional(),
});

export type CreateInterestInput = z.infer<typeof createInterestSchema>;

export const updateInterestSchema = z.object({
  id: z.string().uuid(),
  description: z.string().min(1, "Descricao obrigatoria").max(1000).optional(),
  followUpAt: z.string().optional().nullable(),
  resolved: z.boolean().optional(),
});

export type UpdateInterestInput = z.infer<typeof updateInterestSchema>;
