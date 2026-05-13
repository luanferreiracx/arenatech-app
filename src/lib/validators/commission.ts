import { z } from "zod";

// ── Enums ──

export const commissionTypeEnum = z.enum(["SALE", "SERVICE_ORDER"]);
export type CommissionType = z.infer<typeof commissionTypeEnum>;

export const commissionStatusEnum = z.enum(["PENDING", "APPROVED", "PAID", "CANCELLED"]);
export type CommissionStatus = z.infer<typeof commissionStatusEnum>;

export const COMMISSION_TYPE_LABELS: Record<string, string> = {
  SALE: "Venda",
  SERVICE_ORDER: "Ordem de Servico",
};

export const COMMISSION_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendente",
  APPROVED: "Aprovada",
  PAID: "Paga",
  CANCELLED: "Cancelada",
};

export const COMMISSION_STATUS_VARIANT: Record<string, "default" | "success" | "warning" | "destructive" | "info"> = {
  PENDING: "warning",
  APPROVED: "info",
  PAID: "success",
  CANCELLED: "destructive",
};

// ── Create Rule ──

export const createRuleSchema = z.object({
  name: z.string().min(1, "Nome obrigatorio").max(100),
  type: commissionTypeEnum,
  role: z.string().min(1, "Papel obrigatorio").max(50),
  ratePercent: z.number().min(0, "Taxa deve ser positiva").max(100, "Taxa maxima 100%"),
  fixedAmount: z.number().int().min(0).optional().nullable(),
  active: z.boolean().optional(),
});
export type CreateRuleInput = z.infer<typeof createRuleSchema>;

// ── Update Rule ──

export const updateRuleSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1, "Nome obrigatorio").max(100),
  type: commissionTypeEnum,
  role: z.string().min(1, "Papel obrigatorio").max(50),
  ratePercent: z.number().min(0).max(100),
  fixedAmount: z.number().int().min(0).optional().nullable(),
  active: z.boolean().optional(),
});
export type UpdateRuleInput = z.infer<typeof updateRuleSchema>;

// ── List Rules ──

export const listRulesSchema = z.object({
  type: commissionTypeEnum.optional(),
  active: z.boolean().optional(),
});
export type ListRulesInput = z.infer<typeof listRulesSchema>;

// ── List Commissions ──

export const listCommissionsSchema = z.object({
  status: commissionStatusEnum.optional(),
  type: commissionTypeEnum.optional(),
  userId: z.string().uuid().optional(),
  month: z.number().int().min(1).max(12).optional(),
  year: z.number().int().min(2020).max(2100).optional(),
  page: z.number().int().min(0).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
  sortBy: z.enum(["createdAt", "commissionAmount", "periodMonth"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
});
export type ListCommissionsInput = z.infer<typeof listCommissionsSchema>;

// ── Calculate Commissions ──

export const calculateCommissionsSchema = z.object({
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2020).max(2100),
});
export type CalculateCommissionsInput = z.infer<typeof calculateCommissionsSchema>;

// ── Change Status ──

export const changeStatusSchema = z.object({
  commissionId: z.string().uuid(),
  status: z.enum(["APPROVED", "PAID", "CANCELLED"]),
});
export type ChangeStatusInput = z.infer<typeof changeStatusSchema>;

// ── Batch Change Status ──

export const batchChangeStatusSchema = z.object({
  commissionIds: z.array(z.string().uuid()).min(1, "Selecione pelo menos uma comissao"),
  status: z.enum(["APPROVED", "PAID", "CANCELLED"]),
});
export type BatchChangeStatusInput = z.infer<typeof batchChangeStatusSchema>;

// ── Report ──

export const reportSchema = z.object({
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2020).max(2100),
});
export type ReportInput = z.infer<typeof reportSchema>;
