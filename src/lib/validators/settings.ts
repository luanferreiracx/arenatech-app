import { z } from "zod";

const addressSchema = z.object({
  street: z.string().optional(),
  number: z.string().optional(),
  complement: z.string().optional(),
  neighborhood: z.string().optional(),
  city: z.string().optional(),
  state: z.string().max(2).optional(),
  zip: z.string().optional(),
});

export const updateTenantSettingsSchema = z.object({
  tradeName: z.string().min(1).max(200).optional(),
  legalName: z.string().min(1).max(200).optional(),
  cnpj: z.string().optional(),
  ie: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  address: addressSchema.optional(),
  logoUrl: z.string().url().optional().or(z.literal("")),
});

export type UpdateTenantSettingsInput = z.infer<typeof updateTenantSettingsSchema>;

export const createPaymentMethodSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(["CASH", "PIX", "CREDIT_CARD", "DEBIT_CARD", "BANK_TRANSFER", "STORE_CREDIT", "OTHER"]),
  feePercent: z.number().min(0).max(100).default(0),
  acceptsChange: z.boolean().default(false),
});

export const updatePaymentMethodSchema = createPaymentMethodSchema.partial().extend({
  active: z.boolean().optional(),
});

export type CreatePaymentMethodInput = z.infer<typeof createPaymentMethodSchema>;
export type UpdatePaymentMethodInput = z.infer<typeof updatePaymentMethodSchema>;

export const installmentRuleSchema = z.object({
  installments: z.number().int().min(1).max(36),
  feePercent: z.number().min(0).max(100).default(0),
  minAmount: z.number().min(0).default(0),
});

export const upsertInstallmentRulesSchema = z.object({
  paymentMethodId: z.string().uuid(),
  rules: z.array(installmentRuleSchema),
});

export type InstallmentRuleInput = z.infer<typeof installmentRuleSchema>;
export type UpsertInstallmentRulesInput = z.infer<typeof upsertInstallmentRulesSchema>;

export const updateIntegrationSchema = z.object({
  provider: z.enum([
    "AUTENTIQUE",
    "DEPIX",
    "EVOLUTION_WHATSAPP",
    "CHATWOOT",
    "NUVEM_FISCAL",
    "FOCUS_NFE",
    "IMEI_CHECK",
  ]),
  enabled: z.boolean(),
  config: z.record(z.string(), z.string()).optional(),
});

export type UpdateIntegrationInput = z.infer<typeof updateIntegrationSchema>;

export const updateUserRoleSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["OWNER", "MANAGER", "OPERATOR", "TECHNICIAN", "CASHIER"]),
});

export const inviteUserSchema = z.object({
  cpf: z.string().min(11).max(14),
  role: z.enum(["OWNER", "MANAGER", "OPERATOR", "TECHNICIAN", "CASHIER"]).default("OPERATOR"),
});

export type UpdateUserRoleInput = z.infer<typeof updateUserRoleSchema>;
export type InviteUserInput = z.infer<typeof inviteUserSchema>;
