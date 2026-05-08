import { z } from "zod";

// ────────────────────────────────────────────────────────────────────────────
// Enums & Labels
// ────────────────────────────────────────────────────────────────────────────

export const commissionTypeValues = ["SALE", "SERVICE_ORDER"] as const;
export const commissionStatusValues = ["PENDING", "APPROVED", "PAID", "CANCELLED"] as const;
export const commissionRoleValues = ["seller", "technician", "partner"] as const;

export const commissionTypeLabels: Record<string, string> = {
  SALE: "Venda",
  SERVICE_ORDER: "Ordem de Serviço",
};

export const commissionStatusLabels: Record<string, string> = {
  PENDING: "Pendente",
  APPROVED: "Aprovada",
  PAID: "Paga",
  CANCELLED: "Cancelada",
};

export const commissionRoleLabels: Record<string, string> = {
  seller: "Vendedor",
  technician: "Técnico",
  partner: "Parceiro",
};

// ────────────────────────────────────────────────────────────────────────────
// Commission Rule
// ────────────────────────────────────────────────────────────────────────────

export const createCommissionRuleSchema = z.object({
  name: z.string().min(1, "Nome obrigatório").max(200),
  type: z.enum(commissionTypeValues),
  role: z.enum(commissionRoleValues),
  ratePercent: z.number().min(0, "Percentual não pode ser negativo").max(100, "Percentual máximo 100%"),
  fixedAmount: z.number().min(0, "Valor fixo não pode ser negativo").optional(),
  active: z.boolean(),
});

export const updateCommissionRuleSchema = createCommissionRuleSchema.partial();

export type CreateCommissionRuleInput = z.infer<typeof createCommissionRuleSchema>;
export type UpdateCommissionRuleInput = z.infer<typeof updateCommissionRuleSchema>;

// ────────────────────────────────────────────────────────────────────────────
// List Rules
// ────────────────────────────────────────────────────────────────────────────

export const listCommissionRulesSchema = z.object({
  type: z.enum(commissionTypeValues).optional(),
  active: z.boolean().optional(),
  page: z.number().int().min(0),
  pageSize: z.number().int().min(1).max(100),
});

export type ListCommissionRulesInput = z.infer<typeof listCommissionRulesSchema>;

// ────────────────────────────────────────────────────────────────────────────
// List Commissions
// ────────────────────────────────────────────────────────────────────────────

export const listCommissionsSchema = z.object({
  userId: z.string().uuid().optional(),
  status: z.enum(commissionStatusValues).optional(),
  type: z.enum(commissionTypeValues).optional(),
  periodMonth: z.number().int().min(1).max(12).optional(),
  periodYear: z.number().int().min(2020).max(2100).optional(),
  page: z.number().int().min(0),
  pageSize: z.number().int().min(1).max(100),
});

export type ListCommissionsInput = z.infer<typeof listCommissionsSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Calculate Commissions
// ────────────────────────────────────────────────────────────────────────────

export const calculateCommissionsSchema = z.object({
  periodMonth: z.number().int().min(1).max(12),
  periodYear: z.number().int().min(2020).max(2100),
});

export type CalculateCommissionsInput = z.infer<typeof calculateCommissionsSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Approve / Pay / Cancel
// ────────────────────────────────────────────────────────────────────────────

export const changeCommissionStatusSchema = z.object({
  id: z.string().uuid(),
  notes: z.string().optional(),
});

export type ChangeCommissionStatusInput = z.infer<typeof changeCommissionStatusSchema>;

export const batchChangeStatusSchema = z.object({
  ids: z.array(z.string().uuid()).min(1, "Selecione ao menos uma comissão"),
  notes: z.string().optional(),
});

export type BatchChangeStatusInput = z.infer<typeof batchChangeStatusSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Report
// ────────────────────────────────────────────────────────────────────────────

export const commissionReportSchema = z.object({
  periodMonth: z.number().int().min(1).max(12),
  periodYear: z.number().int().min(2020).max(2100),
});

export type CommissionReportInput = z.infer<typeof commissionReportSchema>;
