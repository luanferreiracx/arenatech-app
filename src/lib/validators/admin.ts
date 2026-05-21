import { z } from "zod";
import { isValidCpf, isValidCnpj } from "@/lib/utils/tax-id";

// ── Enums ──

export const planStatusEnum = z.enum(["ACTIVE", "INACTIVE"]);
export type PlanStatus = z.infer<typeof planStatusEnum>;

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
  plan: z.string().max(100).optional().nullable(),
});
export type UpdateTenantInput = z.infer<typeof updateTenantSchema>;
