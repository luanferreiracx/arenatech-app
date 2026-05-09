import { z } from "zod";

// ────────────────────────────────────────────────────────────────────────────
// Enums & Labels
// ────────────────────────────────────────────────────────────────────────────

export const invoiceTypeValues = ["NFE", "NFCE", "NFSE"] as const;
export const invoiceStatusValues = [
  "DRAFT",
  "PENDING",
  "AUTHORIZED",
  "CANCELLED",
  "REJECTED",
  "CORRECTION_LETTER",
] as const;

export const invoiceTypeLabels: Record<string, string> = {
  NFE: "NF-e",
  NFCE: "NFC-e",
  NFSE: "NFS-e",
};

export const invoiceStatusLabels: Record<string, string> = {
  DRAFT: "Rascunho",
  PENDING: "Pendente",
  AUTHORIZED: "Autorizada",
  CANCELLED: "Cancelada",
  REJECTED: "Rejeitada",
  CORRECTION_LETTER: "Carta Correção",
};

// ────────────────────────────────────────────────────────────────────────────
// Invoice Item
// ────────────────────────────────────────────────────────────────────────────

export const invoiceItemSchema = z.object({
  description: z.string().min(1, "Descrição obrigatória").max(500),
  quantity: z.number().min(0.01, "Quantidade mínima 0.01"),
  unitPrice: z.number().min(0, "Preço unitário não pode ser negativo"),
  ncm: z.string().max(8).optional(),
  cfop: z.string().max(4).optional(),
});

export type InvoiceItemInput = z.infer<typeof invoiceItemSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Create Invoice (manual)
// ────────────────────────────────────────────────────────────────────────────

export const createInvoiceSchema = z.object({
  type: z.enum(invoiceTypeValues),
  recipientName: z.string().min(1, "Nome do destinatário obrigatório").max(200).optional(),
  recipientCpfCnpj: z.string().max(18).optional(),
  items: z.array(invoiceItemSchema).min(1, "Adicione ao menos um item"),
});

export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Create from Reference
// ────────────────────────────────────────────────────────────────────────────

export const createFromSaleSchema = z.object({
  saleId: z.string().uuid(),
  type: z.enum(["NFE", "NFCE"] as const),
});

export type CreateFromSaleInput = z.infer<typeof createFromSaleSchema>;

export const createFromServiceOrderSchema = z.object({
  serviceOrderId: z.string().uuid(),
});

export type CreateFromServiceOrderInput = z.infer<typeof createFromServiceOrderSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Authorize / Cancel / Correction
// ────────────────────────────────────────────────────────────────────────────

export const authorizeInvoiceSchema = z.object({
  id: z.string().uuid(),
});

export type AuthorizeInvoiceInput = z.infer<typeof authorizeInvoiceSchema>;

export const cancelInvoiceSchema = z.object({
  id: z.string().uuid(),
  reason: z.string().min(15, "Justificativa deve ter no mínimo 15 caracteres").max(255),
});

export type CancelInvoiceInput = z.infer<typeof cancelInvoiceSchema>;

export const correctionLetterSchema = z.object({
  id: z.string().uuid(),
  reason: z.string().min(15, "Justificativa deve ter no mínimo 15 caracteres").max(1000),
});

export type CorrectionLetterInput = z.infer<typeof correctionLetterSchema>;

// ────────────────────────────────────────────────────────────────────────────
// List / Filter
// ────────────────────────────────────────────────────────────────────────────

export const listInvoicesSchema = z.object({
  type: z.enum(invoiceTypeValues).optional(),
  status: z.enum(invoiceStatusValues).optional(),
  search: z.string().optional(),
  referenceId: z.string().uuid().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  page: z.number().int().min(0),
  pageSize: z.number().int().min(1).max(100),
});

export type ListInvoicesInput = z.infer<typeof listInvoicesSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Stats
// ────────────────────────────────────────────────────────────────────────────

export const invoiceStatsSchema = z.object({
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

export type InvoiceStatsInput = z.infer<typeof invoiceStatsSchema>;
