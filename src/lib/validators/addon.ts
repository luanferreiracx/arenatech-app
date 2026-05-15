import { z } from "zod";

// ── Addon Schemas ──

export const createAddonSchema = z.object({
  name: z.string().min(1, "Nome obrigatorio").max(255),
  description: z.string().max(500).optional().nullable(),
  queryCount: z.number().int().min(1, "Minimo 1 consulta"),
  /** Price in centavos */
  price: z.number().int().min(0, "Preco deve ser >= 0"),
  validityDays: z.number().int().min(1).max(730),
  sortOrder: z.number().int().min(0).optional(),
  featured: z.boolean().optional(),
  active: z.boolean().optional(),
});
export type CreateAddonInput = z.infer<typeof createAddonSchema>;

export const updateAddonSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(500).optional().nullable(),
  queryCount: z.number().int().min(1).optional(),
  price: z.number().int().min(0).optional(),
  validityDays: z.number().int().min(1).max(730).optional(),
  sortOrder: z.number().int().min(0).optional(),
  featured: z.boolean().optional(),
  active: z.boolean().optional(),
});
export type UpdateAddonInput = z.infer<typeof updateAddonSchema>;

export const listAddonsSchema = z.object({
  activeOnly: z.boolean().optional(),
});

export const assignAddonSchema = z.object({
  tenantId: z.string().uuid(),
  addonId: z.string().uuid(),
  pricePaid: z.number().int().min(0).optional(),
});

// ── Refund Schemas ──

export const refundStatusEnum = z.enum(["PENDING", "PROCESSED", "CANCELLED"]);
export type RefundStatusType = z.infer<typeof refundStatusEnum>;

export const REFUND_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendente",
  PROCESSED: "Processado",
  CANCELLED: "Cancelado",
};

export const listRefundsSchema = z.object({
  status: refundStatusEnum.optional(),
  page: z.number().int().min(1).optional(),
  perPage: z.number().int().min(1).max(100).optional(),
});

export const processRefundSchema = z.object({
  id: z.string().uuid(),
  notes: z.string().max(1000).optional().nullable(),
});

export const cancelRefundSchema = z.object({
  id: z.string().uuid(),
  reason: z.string().min(1, "Motivo obrigatorio").max(1000),
});
