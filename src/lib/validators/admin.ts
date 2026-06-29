import { z } from "zod";
import { isValidCpf, isValidCnpj } from "@/lib/utils/tax-id";
import { MODULE_KEYS } from "@/lib/modules";

// ── Enums ──

export const planStatusEnum = z.enum(["ACTIVE", "INACTIVE"]);
export type PlanStatus = z.infer<typeof planStatusEnum>;

/** Módulos liberáveis por plano (gating). */
export const moduleKeyEnum = z.enum([...MODULE_KEYS] as [string, ...string[]]);
export const planModulesSchema = z.array(moduleKeyEnum).default([]);

export const preRegistrationStatusEnum = z.enum(["PENDING", "APPROVED", "REJECTED"]);
export type PreRegistrationStatus = z.infer<typeof preRegistrationStatusEnum>;

export const PLAN_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Ativo",
  INACTIVE: "Inativo",
};

export const PRE_REGISTRATION_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendente",
  APPROVED: "Aprovado",
  REJECTED: "Rejeitado",
};

export const PRE_REGISTRATION_STATUS_VARIANT: Record<string, "default" | "success" | "warning" | "destructive" | "info"> = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "destructive",
};

// ── Create Plan ──

export const createPlanSchema = z.object({
  name: z.string().min(1, "Nome obrigatorio").max(100),
  slug: z.string().min(1, "Slug obrigatorio").max(100).regex(/^[a-z0-9_-]+$/, "Slug deve ser alfanumerico"),
  description: z.string().max(500).optional().nullable(),
  monthlyPrice: z.number().int().min(0, "Preco deve ser positivo"),
  yearlyPrice: z.number().int().min(0).optional().nullable(),
  maxUsers: z.number().int().min(1).max(1000),
  maxImeiQueries: z.number().int().min(0).max(10000),
  features: z.record(z.string(), z.unknown()).optional().nullable(),
  /** Módulos liberados para o plano (gating). Vazio = só os padrões (wallet). */
  modules: z.array(moduleKeyEnum).optional(),
});
export type CreatePlanInput = z.infer<typeof createPlanSchema>;

// ── Update Plan ──

export const updatePlanSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1, "Nome obrigatorio").max(100),
  description: z.string().max(500).optional().nullable(),
  monthlyPrice: z.number().int().min(0),
  yearlyPrice: z.number().int().min(0).optional().nullable(),
  maxUsers: z.number().int().min(1).max(1000),
  maxImeiQueries: z.number().int().min(0).max(10000),
  features: z.record(z.string(), z.unknown()).optional().nullable(),
  /** Módulos liberados para o plano (gating). Vazio = só os padrões (wallet). */
  modules: z.array(moduleKeyEnum).optional(),
  status: planStatusEnum,
});
export type UpdatePlanInput = z.infer<typeof updatePlanSchema>;

// ── List Plans ──

export const listPlansSchema = z.object({
  status: planStatusEnum.optional(),
});
export type ListPlansInput = z.infer<typeof listPlansSchema>;

// ── Submit Pre-Registration ──

export const submitPreRegistrationSchema = z.object({
  tradeName: z.string().min(1, "Nome fantasia obrigatorio").max(200),
  legalName: z.string().max(200).optional().nullable(),
  cnpj: z
    .string()
    .max(18)
    .optional()
    .nullable()
    .refine(
      (v) => v == null || v === "" || isValidCnpj(v),
      { message: "CNPJ invalido (digito verificador nao confere)" },
    ),
  ownerName: z.string().min(1, "Nome do responsavel obrigatorio").max(200),
  ownerCpf: z
    .string()
    .min(11, "CPF obrigatorio")
    .max(14)
    .refine(isValidCpf, { message: "CPF invalido (digito verificador nao confere)" }),
  ownerEmail: z.string().email("Email invalido").max(200),
  ownerPhone: z.string().min(10, "Telefone obrigatorio").max(20),
  planId: z.string().uuid().optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});
export type SubmitPreRegistrationInput = z.infer<typeof submitPreRegistrationSchema>;

// ── Approve Pre-Registration ──

export const approvePreRegistrationSchema = z.object({
  id: z.string().uuid(),
  planId: z.string().uuid().optional().nullable(),
});
export type ApprovePreRegistrationInput = z.infer<typeof approvePreRegistrationSchema>;

// ── Reject Pre-Registration ──

export const rejectPreRegistrationSchema = z.object({
  id: z.string().uuid(),
  reason: z.string().min(1, "Motivo obrigatorio").max(500),
});
export type RejectPreRegistrationInput = z.infer<typeof rejectPreRegistrationSchema>;

// ── List Pre-Registrations ──

export const listPreRegistrationsSchema = z.object({
  status: preRegistrationStatusEnum.optional(),
  search: z.string().optional(),
  page: z.number().int().min(0).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
});
export type ListPreRegistrationsInput = z.infer<typeof listPreRegistrationsSchema>;

// ── List Tenants (admin) ──

export const listTenantsSchema = z.object({
  status: z.enum(["PENDING", "ACTIVE", "SUSPENDED", "CANCELLED"]).optional(),
  search: z.string().optional(),
  page: z.number().int().min(0).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
});
export type ListTenantsInput = z.infer<typeof listTenantsSchema>;

// ── Update Tenant ──

export const updateTenantSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200),
  status: z.enum(["PENDING", "ACTIVE", "SUSPENDED", "CANCELLED"]),
  plan: z.string().min(1).max(100).optional().nullable(),
  /** Gate da API externa (ADR 0057): libera o tenant a emitir/usar API-keys. */
  apiAccessEnabled: z.boolean().optional(),
});
export type UpdateTenantInput = z.infer<typeof updateTenantSchema>;

export const resetTenantUserPasswordSchema = z.object({
  tenantId: z.string().uuid(),
  userId: z.string().uuid(),
});
export type ResetTenantUserPasswordInput = z.infer<typeof resetTenantUserPasswordSchema>;

export const resetTenantUserTwoFactorSchema = z.object({
  tenantId: z.string().uuid(),
  userId: z.string().uuid(),
});
export type ResetTenantUserTwoFactorInput = z.infer<typeof resetTenantUserTwoFactorSchema>;

export const tenantUserRoleEnum = z.enum(["admin", "operator"]);
export type TenantUserRole = z.infer<typeof tenantUserRoleEnum>;

// Email + WhatsApp obrigatórios (canais de recuperação do 2FA — pré-req de saque).
// Telefone BR: DDD + número (10–11 dígitos), precisa ser WhatsApp válido.
const adminRequiredEmail = z.string().email("E-mail inválido").max(200);
const adminRequiredBrPhone = z
  .string()
  .min(10, "WhatsApp obrigatório (com DDD)")
  .max(20)
  .refine((v) => {
    const d = v.replace(/\D/g, "").length;
    return d >= 10 && d <= 11;
  }, { message: "WhatsApp inválido — informe DDD + número (10 ou 11 dígitos)" });

export const createTenantUserSchema = z.object({
  tenantId: z.string().uuid(),
  name: z.string().min(1, "Nome obrigatorio").max(255),
  cpf: z
    .string()
    .min(11, "CPF obrigatorio")
    .max(14)
    .refine(isValidCpf, { message: "CPF invalido (digito verificador nao confere)" }),
  email: adminRequiredEmail,
  phone: adminRequiredBrPhone,
  role: tenantUserRoleEnum,
  isTechnician: z.boolean().optional(),
  isCashier: z.boolean().optional(),
});
export type CreateTenantUserInput = z.infer<typeof createTenantUserSchema>;

export const updateTenantUserSchema = z.object({
  tenantId: z.string().uuid(),
  userId: z.string().uuid(),
  name: z.string().min(1, "Nome obrigatorio").max(255),
  email: adminRequiredEmail,
  phone: adminRequiredBrPhone,
  role: tenantUserRoleEnum,
  isTechnician: z.boolean().optional(),
  isCashier: z.boolean().optional(),
});
export type UpdateTenantUserInput = z.infer<typeof updateTenantUserSchema>;

export const removeTenantUserSchema = z.object({
  tenantId: z.string().uuid(),
  userId: z.string().uuid(),
});
export type RemoveTenantUserInput = z.infer<typeof removeTenantUserSchema>;
