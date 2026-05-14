import { z } from "zod";

// ── Enums ──

export const depixWithdrawStatusEnum = z.enum([
  "PENDING",
  "PROCESSING",
  "SENT",
  "FAILED",
  "CANCELLED",
]);
export type DepixWithdrawStatus = z.infer<typeof depixWithdrawStatusEnum>;

export const pixKeyTypeEnum = z.enum([
  "RANDOM",
  "CPF",
  "CNPJ",
  "EMAIL",
  "PHONE",
]);
export type PixKeyType = z.infer<typeof pixKeyTypeEnum>;

export const DEPIX_STATUS_LABELS: Record<string, string> = {
  PENDING: "Aguardando",
  PROCESSING: "Processando",
  SENT: "Enviado",
  FAILED: "Falhou",
  CANCELLED: "Cancelado",
};

export const PIX_KEY_TYPE_LABELS: Record<string, string> = {
  RANDOM: "Aleatoria",
  CPF: "CPF",
  CNPJ: "CNPJ",
  EMAIL: "Email",
  PHONE: "Telefone",
};

// ── Create Withdraw ──

export const createWithdrawSchema = z.object({
  pixKeyType: pixKeyTypeEnum,
  pixKey: z.string().min(1, "Chave PIX obrigatoria").max(255),
  recipientName: z.string().max(200).optional().nullable(),
  recipientTaxId: z.string().min(11).max(18),
  notes: z.string().max(500).optional().nullable(),
  /** Value in reais (not centavos) */
  requestedAmount: z.number().min(2, "Valor minimo R$ 2,00").max(6000, "Valor maximo R$ 6.000,00"),
});
export type CreateWithdrawInput = z.infer<typeof createWithdrawSchema>;

// ── Update Withdraw ──

export const updateWithdrawSchema = z.object({
  id: z.string().uuid(),
  recipientName: z.string().max(200).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});
export type UpdateWithdrawInput = z.infer<typeof updateWithdrawSchema>;

// ── List Withdrawals ──

export const listWithdrawalsSchema = z.object({
  status: depixWithdrawStatusEnum.optional(),
  pixKey: z.string().optional(),
  recipientName: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  page: z.number().int().min(1).optional(),
  perPage: z.number().int().min(1).max(100).optional(),
});
export type ListWithdrawalsInput = z.infer<typeof listWithdrawalsSchema>;

// ── Search Recipients ──

export const searchRecipientsSchema = z.object({
  query: z.string().min(2).max(100),
});
