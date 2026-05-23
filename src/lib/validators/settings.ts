import { z } from "zod";

// ── General settings ──

export const updateGeneralSettingsSchema = z.object({
  tradeName: z.string().min(1, "Nome da loja obrigatorio").max(255),
  legalName: z.string().max(255).optional().nullable(),
  cnpj: z.string().max(14).optional().nullable(),
  phone: z.string().max(11).optional().nullable(),
  email: z.string().email("E-mail invalido").max(255).optional().nullable(),
  address: z
    .object({
      cep: z.string().max(8).optional(),
      logradouro: z.string().max(255).optional(),
      numero: z.string().max(20).optional(),
      complemento: z.string().max(100).optional(),
      bairro: z.string().max(100).optional(),
      cidade: z.string().max(100).optional(),
      uf: z.string().max(2).optional(),
    })
    .optional()
    .nullable(),
});

export type UpdateGeneralSettingsInput = z.infer<typeof updateGeneralSettingsSchema>;

// ── Payment methods ──

export const updatePaymentMethodSchema = z.object({
  id: z.string().uuid(),
  active: z.boolean(),
  feePercent: z.number().min(0).max(99.99).optional(),
});

export type UpdatePaymentMethodInput = z.infer<typeof updatePaymentMethodSchema>;

export const createPaymentMethodSchema = z.object({
  name: z.string().min(1, "Nome obrigatorio").max(100),
  type: z.enum([
    "CASH",
    "PIX",
    "CREDIT_CARD",
    "DEBIT_CARD",
    "BANK_TRANSFER",
    "STORE_CREDIT",
    "OTHER",
  ]),
  feePercent: z.number().min(0).max(99.99).optional(),
  active: z.boolean().optional(),
  acceptsChange: z.boolean().optional(),
});

export type CreatePaymentMethodInput = z.infer<typeof createPaymentMethodSchema>;

export const upsertInstallmentRulesSchema = z.object({
  paymentMethodId: z.string().uuid(),
  rules: z.array(
    z.object({
      installments: z.number().int().min(2).max(36),
      feePercent: z.number().min(0).max(99.99),
      minAmount: z.number().int().min(0).optional(), // centavos
    })
  ),
});

export type UpsertInstallmentRulesInput = z.infer<typeof upsertInstallmentRulesSchema>;

// ── Integrations ──

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
  config: z.record(z.string(), z.unknown()).optional().nullable(),
});

export type UpdateIntegrationInput = z.infer<typeof updateIntegrationSchema>;

// ── Users (tenant members) ──

export const listUsersSchema = z.object({
  search: z.string().optional(),
  role: z.string().optional(),
  page: z.number().int().min(0).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
});

export type ListUsersInput = z.infer<typeof listUsersSchema>;

export const createUserSchema = z.object({
  name: z.string().min(1, "Nome obrigatorio").max(255),
  cpf: z.string().min(11, "CPF obrigatorio").max(11),
  phone: z.string().max(11).optional().nullable(),
  role: z.enum(["admin", "operator", "technician", "cashier"]),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z.object({
  userId: z.string().uuid(),
  name: z.string().min(1).max(255).optional(),
  phone: z.string().max(11).optional().nullable(),
  role: z.enum(["admin", "operator", "technician", "cashier"]),
});

export type UpdateUserInput = z.infer<typeof updateUserSchema>;

// ── Security (change password) ──

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Senha atual obrigatoria"),
    newPassword: z.string().min(6, "Minimo 6 caracteres"),
    confirmPassword: z.string().min(1, "Confirme a nova senha"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Senhas nao conferem",
    path: ["confirmPassword"],
  });

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
