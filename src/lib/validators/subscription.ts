import { z } from "zod";
import { isValidCpf, isValidCnpj } from "@/lib/utils/tax-id";

// ── Subscription status ──

export const subscriptionStatusEnum = z.enum(["ACTIVE", "TRIAL", "SUSPENDED", "CANCELLED", "EXPIRED"]);
export type SubscriptionStatus = z.infer<typeof subscriptionStatusEnum>;

export const SUBSCRIPTION_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Ativa",
  TRIAL: "Trial",
  SUSPENDED: "Suspensa",
  CANCELLED: "Cancelada",
  EXPIRED: "Expirada",
};

export const SUBSCRIPTION_STATUS_VARIANT: Record<string, "default" | "success" | "warning" | "destructive" | "info"> = {
  ACTIVE: "success",
  TRIAL: "info",
  SUSPENDED: "warning",
  CANCELLED: "destructive",
  EXPIRED: "destructive",
};

// ── Refund status ──

export const refundStatusEnum = z.enum(["PENDING", "PROCESSED", "CANCELLED"]);
export type RefundStatus = z.infer<typeof refundStatusEnum>;

export const REFUND_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendente",
  PROCESSED: "Processado",
  CANCELLED: "Cancelado",
};

export const REFUND_STATUS_VARIANT: Record<string, "default" | "success" | "warning" | "destructive" | "info"> = {
  PENDING: "warning",
  PROCESSED: "success",
  CANCELLED: "destructive",
};

// ── Addon schemas ──

export const createAddonSchema = z.object({
  name: z.string().min(1, "Nome obrigatorio").max(200),
  description: z.string().max(500).optional().nullable(),
  queryCount: z.number().int().min(1, "Minimo 1 consulta"),
  price: z.number().int().min(0, "Preco deve ser positivo"),
  validityDays: z.number().int().min(1).max(730),
  displayOrder: z.number().int().min(0).optional(),
  featured: z.boolean().optional(),
  active: z.boolean().optional(),
});
export type CreateAddonInput = z.infer<typeof createAddonSchema>;

export const updateAddonSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200),
  description: z.string().max(500).optional().nullable(),
  queryCount: z.number().int().min(1),
  price: z.number().int().min(0),
  validityDays: z.number().int().min(1).max(730),
  displayOrder: z.number().int().min(0).optional(),
  featured: z.boolean().optional(),
  active: z.boolean().optional(),
});
export type UpdateAddonInput = z.infer<typeof updateAddonSchema>;

export const listAddonsSchema = z.object({
  active: z.boolean().optional(),
});
export type ListAddonsInput = z.infer<typeof listAddonsSchema>;

// ── Refund schemas ──

export const listRefundsSchema = z.object({
  status: refundStatusEnum.optional(),
  page: z.number().int().min(0).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
});
export type ListRefundsInput = z.infer<typeof listRefundsSchema>;

export const processRefundSchema = z.object({
  id: z.string().uuid(),
  notes: z.string().max(500).optional().nullable(),
});
export type ProcessRefundInput = z.infer<typeof processRefundSchema>;

export const cancelRefundSchema = z.object({
  id: z.string().uuid(),
  reason: z.string().min(1, "Motivo obrigatorio").max(500),
});
export type CancelRefundInput = z.infer<typeof cancelRefundSchema>;

// ── WhatsApp Log schemas ──

export const listWhatsappLogsSchema = z.object({
  phone: z.string().optional(),
  status: z.enum(["SENT", "FAILED", "OUTSIDE_WINDOW"]).optional(),
  type: z.enum(["TEXT", "TEMPLATE", "MEDIA"]).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  page: z.number().int().min(0).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
});
export type ListWhatsappLogsInput = z.infer<typeof listWhatsappLogsSchema>;

// ── Audit Log schemas ──

export const listAuditLogsSchema = z.object({
  userId: z.string().uuid().optional(),
  action: z.string().optional(),
  entity: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  page: z.number().int().min(0).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
});
export type ListAuditLogsInput = z.infer<typeof listAuditLogsSchema>;

// ── Fiscal Settings schemas ──

export const updateFiscalSettingsSchema = z.object({
  razaoSocial: z.string().max(200).optional().nullable(),
  nomeFantasia: z.string().max(200).optional().nullable(),
  cnpj: z.string().max(18).optional().nullable(),
  inscricaoEstadual: z.string().max(20).optional().nullable(),
  inscricaoMunicipal: z.string().max(20).optional().nullable(),
  cnae: z.string().max(10).optional().nullable(),
  regimeTributario: z.enum(["1", "2", "3"]).optional(),
  // Address
  cep: z.string().max(9).optional().nullable(),
  logradouro: z.string().max(200).optional().nullable(),
  numero: z.string().max(20).optional().nullable(),
  complemento: z.string().max(100).optional().nullable(),
  bairro: z.string().max(100).optional().nullable(),
  cidade: z.string().max(100).optional().nullable(),
  uf: z.string().max(2).optional().nullable(),
  codigoMunicipio: z.string().max(7).optional().nullable(),
  // NF-e config
  nfeSerie: z.number().int().min(1).max(999).optional(),
  nfceSerie: z.number().int().min(1).max(999).optional(),
  nfeAmbiente: z.enum(["1", "2"]).optional(),
  tipoDocumentoPadrao: z.enum(["nfe", "nfce", "nenhum"]).optional(),
  nfeUltimoNumero: z.number().int().min(0).optional(),
  nfceUltimoNumero: z.number().int().min(0).optional(),
  nfceCscId: z.string().max(10).optional().nullable(),
  nfceCscToken: z.string().max(100).optional().nullable(),
  naturezaOperacao: z.string().max(100).optional().nullable(),
  // Tax
  cfopDentroEstado: z.string().max(4).optional().nullable(),
  cfopForaEstado: z.string().max(4).optional().nullable(),
  csosnPadrao: z.string().max(3).optional().nullable(),
  ncmPadrao: z.string().max(8).optional().nullable(),
  // Options
  emitirNfAutomatico: z.boolean().optional(),
  habilitado: z.boolean().optional(),
  certificadoSenha: z.string().max(100).optional().nullable(),
});
export type UpdateFiscalSettingsInput = z.infer<typeof updateFiscalSettingsSchema>;

// ── Create Tenant (admin) ──

export const createTenantSchema = z.object({
  name: z.string().min(1, "Nome obrigatorio").max(200),
  email: z.string().email("Email invalido").max(200),
  phone: z
    .string()
    .min(10, "Telefone obrigatorio")
    .max(20)
    .refine((v) => v.replace(/\D/g, "").length >= 10, "Telefone invalido"),
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
  planId: z.string().uuid().optional().nullable(),
  trialDays: z.number().int().min(0).max(365).optional(),
  // Address
  cep: z.string().max(9).optional().nullable(),
  address: z.string().max(200).optional().nullable(),
  addressNumber: z.string().max(20).optional().nullable(),
  addressComplement: z.string().max(100).optional().nullable(),
  neighborhood: z.string().max(100).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  state: z.string().max(2).optional().nullable(),
});
export type CreateTenantInput = z.infer<typeof createTenantSchema>;

// ── Technician Report schemas ──

export const technicianReportSchema = z.object({
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  technicianId: z.string().uuid().optional(),
});
export type TechnicianReportInput = z.infer<typeof technicianReportSchema>;
