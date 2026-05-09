import { z } from "zod";

// ────────────────────────────────────────────────────────────────────────────
// Enums & Labels
// ────────────────────────────────────────────────────────────────────────────

export const planStatusValues = ["ACTIVE", "INACTIVE"] as const;
export const preRegistrationStatusValues = ["PENDING", "APPROVED", "REJECTED"] as const;
export const tenantStatusValues = ["PENDING", "ACTIVE", "SUSPENDED", "CANCELLED"] as const;

export const planStatusLabels: Record<string, string> = {
  ACTIVE: "Ativo",
  INACTIVE: "Inativo",
};

export const preRegistrationStatusLabels: Record<string, string> = {
  PENDING: "Pendente",
  APPROVED: "Aprovado",
  REJECTED: "Rejeitado",
};

export const tenantStatusLabels: Record<string, string> = {
  PENDING: "Pendente",
  ACTIVE: "Ativo",
  SUSPENDED: "Suspenso",
  CANCELLED: "Cancelado",
};

// ────────────────────────────────────────────────────────────────────────────
// Plans
// ────────────────────────────────────────────────────────────────────────────

export const createPlanSchema = z.object({
  name: z.string().min(1, "Nome obrigatório").max(200),
  slug: z
    .string()
    .min(1, "Slug obrigatório")
    .max(100)
    .regex(/^[a-z0-9-]+$/, "Slug deve conter apenas letras minúsculas, números e hífens"),
  description: z.string().max(500).optional(),
  monthlyPrice: z.number().min(0, "Preço não pode ser negativo"),
  yearlyPrice: z.number().min(0).optional(),
  maxUsers: z.number().int().min(1),
  maxImeiQueries: z.number().int().min(0),
  features: z.record(z.string(), z.unknown()).optional(),
  status: z.enum(planStatusValues),
});

export const updatePlanSchema = createPlanSchema.partial();

export type CreatePlanInput = z.infer<typeof createPlanSchema>;
export type UpdatePlanInput = z.infer<typeof updatePlanSchema>;

export const listPlansSchema = z.object({
  status: z.enum(planStatusValues).optional(),
  page: z.number().int().min(0),
  pageSize: z.number().int().min(1).max(100),
});

export type ListPlansInput = z.infer<typeof listPlansSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Tenants (admin view)
// ────────────────────────────────────────────────────────────────────────────

export const listTenantsSchema = z.object({
  search: z.string().optional(),
  status: z.enum(tenantStatusValues).optional(),
  page: z.number().int().min(0),
  pageSize: z.number().int().min(1).max(100),
});

export type ListTenantsInput = z.infer<typeof listTenantsSchema>;

export const updateTenantStatusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(tenantStatusValues),
});

export type UpdateTenantStatusInput = z.infer<typeof updateTenantStatusSchema>;

export const updateTenantPlanSchema = z.object({
  id: z.string().uuid(),
  plan: z.string().max(200),
});

export type UpdateTenantPlanInput = z.infer<typeof updateTenantPlanSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Pre-Registrations
// ────────────────────────────────────────────────────────────────────────────

export const createPreRegistrationSchema = z.object({
  tradeName: z.string().min(1, "Nome fantasia obrigatório").max(200),
  legalName: z.string().max(200).optional(),
  cnpj: z.string().max(18).optional(),
  ownerName: z.string().min(1, "Nome do responsável obrigatório").max(200),
  ownerCpf: z.string().min(11, "CPF obrigatório").max(14),
  ownerEmail: z.string().email("Email inválido"),
  ownerPhone: z.string().min(10, "Telefone obrigatório").max(20),
  planId: z.string().uuid().optional(),
});

export type CreatePreRegistrationInput = z.infer<typeof createPreRegistrationSchema>;

export const listPreRegistrationsSchema = z.object({
  status: z.enum(preRegistrationStatusValues).optional(),
  page: z.number().int().min(0),
  pageSize: z.number().int().min(1).max(100),
});

export type ListPreRegistrationsInput = z.infer<typeof listPreRegistrationsSchema>;

export const approvePreRegistrationSchema = z.object({
  id: z.string().uuid(),
  notes: z.string().optional(),
});

export type ApprovePreRegistrationInput = z.infer<typeof approvePreRegistrationSchema>;

export const rejectPreRegistrationSchema = z.object({
  id: z.string().uuid(),
  notes: z.string().optional(),
});

export type RejectPreRegistrationInput = z.infer<typeof rejectPreRegistrationSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Reports
// ────────────────────────────────────────────────────────────────────────────

export const adminReportSchema = z.object({
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

export type AdminReportInput = z.infer<typeof adminReportSchema>;
