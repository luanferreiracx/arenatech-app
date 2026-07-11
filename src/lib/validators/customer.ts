import { z } from "zod";
import { normalizeCpf, validateCpf } from "@/lib/validators/cpf";

// ── CNPJ validation (SPEC RN-3, RN-5) ──

export function normalizeCnpj(cnpj: string): string {
  return cnpj.replace(/\D/g, "");
}

export function validateCnpj(cnpj: string): boolean {
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(digits)) return false;

  const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += Number(digits[i]) * weights1[i]!;
  }
  let remainder = sum % 11;
  const d1 = remainder < 2 ? 0 : 11 - remainder;
  if (Number(digits[12]) !== d1) return false;

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
  .min(1, "CNPJ obrigatório")
  .transform(normalizeCnpj)
  .refine(validateCnpj, { message: "CNPJ inválido" });

// ── Customer type enum ──

export const customerTypeSchema = z.enum(["PF", "PJ"]);

// ── Label maps (SPEC: português apenas em UI) ──

export const CUSTOMER_TYPE_LABELS: Record<string, string> = {
  PF: "Pessoa Física",
  PJ: "Pessoa Jurídica",
};

export const INTEREST_STATUS_LABELS: Record<string, string> = {
  WAITING: "Em Espera",
  CONTACTED: "Contatado",
  COMPLETED: "Finalizado",
  CANCELLED: "Cancelado",
};

export const INTEREST_TYPE_LABELS: Record<string, string> = {
  PURCHASE: "Compra",
  SALE: "Venda",
  TRADE: "Troca",
  REPAIR: "Reparo",
};

export const INTERACTION_TYPE_LABELS: Record<string, string> = {
  PHONE: "Ligação",
  WHATSAPP: "WhatsApp",
  IN_STORE: "Em Loja",
};

// ── Create customer (SPEC 3.1 + 7) ──

export const createCustomerSchema = z
  .object({
    type: customerTypeSchema,
    name: z.string().min(2, "Nome deve ter ao menos 2 caracteres").max(255),
    cpf: z.string().optional(),
    cnpj: z.string().optional(),
    tradeName: z.string().max(255).optional(),
    birthDate: z.string().optional(),
    phone: z.string().min(10, "Telefone deve ter ao menos 10 dígitos").max(20),
    phoneSecondary: z.string().max(20).optional(),
    email: z.string().email("E-mail inválido").max(255).optional().or(z.literal("")),
    zipCode: z.string().max(9).optional(),
    street: z.string().max(255).optional(),
    streetNumber: z.string().max(20).optional(),
    complement: z.string().max(100).optional(),
    neighborhood: z.string().max(100).optional(),
    city: z.string().max(100).optional(),
    state: z.string().length(2, "UF deve ter 2 caracteres").optional().or(z.literal("")),
    notes: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    // SPEC RN-2: PF must have CPF, PJ must have CNPJ
    if (data.type === "PF") {
      if (!data.cpf || data.cpf.trim() === "") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "CPF é obrigatório para pessoa física",
          path: ["cpf"],
        });
      } else {
        const normalized = normalizeCpf(data.cpf);
        if (!validateCpf(normalized)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "CPF inválido",
            path: ["cpf"],
          });
        }
      }
    }
    if (data.type === "PJ") {
      if (!data.cnpj || data.cnpj.trim() === "") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "CNPJ é obrigatório para pessoa jurídica",
          path: ["cnpj"],
        });
      } else {
        const normalized = normalizeCnpj(data.cnpj);
        if (!validateCnpj(normalized)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "CNPJ inválido",
            path: ["cnpj"],
          });
        }
      }
    }
    // SPEC 7 cross-field: tradeName only for PJ
    if (data.type === "PF" && data.tradeName && data.tradeName.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Nome fantasia é exclusivo para pessoa jurídica",
        path: ["tradeName"],
      });
    }
  });

export type CreateCustomerInput = z.input<typeof createCustomerSchema>;

// ── Update customer (SPEC 4.4) ──

export const updateCustomerSchema = z
  .object({
    id: z.string().uuid(),
    type: customerTypeSchema,
    name: z.string().min(2, "Nome deve ter ao menos 2 caracteres").max(255),
    cpf: z.string().optional(),
    cnpj: z.string().optional(),
    tradeName: z.string().max(255).optional(),
    birthDate: z.string().optional(),
    phone: z.string().min(10, "Telefone deve ter ao menos 10 dígitos").max(20),
    phoneSecondary: z.string().max(20).optional(),
    email: z.string().email("E-mail inválido").max(255).optional().or(z.literal("")),
    zipCode: z.string().max(9).optional(),
    street: z.string().max(255).optional(),
    streetNumber: z.string().max(20).optional(),
    complement: z.string().max(100).optional(),
    neighborhood: z.string().max(100).optional(),
    city: z.string().max(100).optional(),
    state: z.string().length(2, "UF deve ter 2 caracteres").optional().or(z.literal("")),
    notes: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.type === "PF") {
      if (!data.cpf || data.cpf.trim() === "") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "CPF é obrigatório para pessoa física",
          path: ["cpf"],
        });
      } else {
        const normalized = normalizeCpf(data.cpf);
        if (!validateCpf(normalized)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "CPF inválido",
            path: ["cpf"],
          });
        }
      }
    }
    if (data.type === "PJ") {
      if (!data.cnpj || data.cnpj.trim() === "") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "CNPJ é obrigatório para pessoa jurídica",
          path: ["cnpj"],
        });
      } else {
        const normalized = normalizeCnpj(data.cnpj);
        if (!validateCnpj(normalized)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "CNPJ inválido",
            path: ["cnpj"],
          });
        }
      }
    }
    if (data.type === "PF" && data.tradeName && data.tradeName.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Nome fantasia é exclusivo para pessoa jurídica",
        path: ["tradeName"],
      });
    }
  });

export type UpdateCustomerInput = z.input<typeof updateCustomerSchema>;

// ── List customers (SPEC 4.1) ──

export const listCustomersSchema = z.object({
  search: z.string().optional(),
  type: z.enum(["PF", "PJ", "ALL"]).optional(),
  includeDeleted: z.boolean().optional(),
  // Pagina APENAS inativos (deletedAt IS NOT NULL) — usado pela aba "Inativos".
  onlyDeleted: z.boolean().optional(),
  page: z.number().int().min(0).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
  sortBy: z.enum(["name", "createdAt"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
});

export type ListCustomersInput = z.infer<typeof listCustomersSchema>;

// ── Interest schemas (SPEC 3.2) ──

export const interestStatusEnum = z.enum(["WAITING", "CONTACTED", "COMPLETED", "CANCELLED"]);
export type InterestStatusValue = z.infer<typeof interestStatusEnum>;

/**
 * Estados terminais do funil de interesse. Uma vez COMPLETED ou CANCELLED, o
 * interesse não volta atrás — para retomar, o atendente cadastra um novo
 * interesse. Guarda a integridade do funil e das métricas de conversão.
 */
export const TERMINAL_INTEREST_STATUSES: readonly InterestStatusValue[] = [
  "COMPLETED",
  "CANCELLED",
];

export function isTerminalInterestStatus(status: InterestStatusValue): boolean {
  return TERMINAL_INTEREST_STATUSES.includes(status);
}

/** Só dígitos — chave estável para armazenar/buscar telefone sem máscara. */
export function normalizePhoneDigits(phone: string): string {
  return phone.replace(/\D/g, "");
}

export const interestTypeEnum = z.enum(["PURCHASE", "SALE", "TRADE", "REPAIR"]);
export type InterestTypeValue = z.infer<typeof interestTypeEnum>;

export const interactionTypeEnum = z.enum(["PHONE", "WHATSAPP", "IN_STORE"]);
export type InteractionTypeValue = z.infer<typeof interactionTypeEnum>;

export const createInterestSchema = z.object({
  customerName: z.string().min(1, "Nome do cliente é obrigatório").max(150),
  phone: z.string().min(1, "Telefone é obrigatório").max(20),
  cpf: z.string().max(14).optional(),
  email: z.string().email("E-mail inválido").max(255).optional().or(z.literal("")),
  type: interestTypeEnum,
  desiredModel: z.string().min(1, "Modelo desejado é obrigatório").max(200),
  notes: z.string().optional(),
});

export type CreateInterestInput = z.infer<typeof createInterestSchema>;

export const updateInterestStatusSchema = z.object({
  id: z.string().uuid(),
  status: interestStatusEnum,
});

export type UpdateInterestStatusInput = z.infer<typeof updateInterestStatusSchema>;

export const listInterestsSchema = z.object({
  search: z.string().optional(),
  status: interestStatusEnum.optional(),
  type: interestTypeEnum.optional(),
  page: z.number().int().min(0).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
});

export type ListInterestsInput = z.infer<typeof listInterestsSchema>;

// ── Interaction schemas (SPEC 3.3) ──

export const addInteractionSchema = z.object({
  interestId: z.string().uuid(),
  type: interactionTypeEnum,
  description: z.string().min(1, "Descrição é obrigatória"),
});

export type AddInteractionInput = z.infer<typeof addInteractionSchema>;

// ── Send batch (SPEC 9 Fluxo 7, RN-11) ──

export const sendBatchSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(5, "Máximo 5 destinatários por envio"),
  message: z.string().min(10, "Mensagem é obrigatória (mínimo 10 caracteres)"),
});

export type SendBatchInput = z.infer<typeof sendBatchSchema>;
