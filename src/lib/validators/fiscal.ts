import { z } from "zod";

// ── Enums ──

export const invoiceTypeEnum = z.enum(["NFE", "NFCE", "NFSE"]);
export type InvoiceType = z.infer<typeof invoiceTypeEnum>;

export const invoiceStatusEnum = z.enum([
  "DRAFT",
  "PENDING",
  "AUTHORIZED",
  "CANCELLED",
  "REJECTED",
  "CORRECTION_LETTER",
]);
export type InvoiceStatus = z.infer<typeof invoiceStatusEnum>;

export const INVOICE_TYPE_LABELS: Record<string, string> = {
  NFE: "NF-e",
  NFCE: "NFC-e",
  NFSE: "NFS-e",
};

export const INVOICE_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Rascunho",
  PENDING: "Pendente",
  AUTHORIZED: "Autorizada",
  CANCELLED: "Cancelada",
  REJECTED: "Rejeitada",
  CORRECTION_LETTER: "Carta Correcao",
};

export const INVOICE_STATUS_VARIANT: Record<string, "default" | "success" | "warning" | "destructive" | "info"> = {
  DRAFT: "default",
  PENDING: "warning",
  AUTHORIZED: "success",
  CANCELLED: "destructive",
  REJECTED: "destructive",
  CORRECTION_LETTER: "info",
};

// ── Create Invoice ──

export const invoiceItemSchema = z.object({
  description: z.string().min(1, "Descricao obrigatoria").max(500),
  quantity: z.number().min(0.01, "Quantidade minima 0.01"),
  unitPrice: z.number().int().min(1, "Preco unitario obrigatorio"),
  ncm: z.string().max(10).optional().nullable(),
  cfop: z.string().max(10).optional().nullable(),
});

export const createInvoiceSchema = z.object({
  type: invoiceTypeEnum,
  recipientName: z.string().min(1, "Nome do destinatario obrigatorio").max(200),
  recipientCpfCnpj: z.string().min(11, "CPF/CNPJ obrigatorio").max(18),
  items: z.array(invoiceItemSchema).min(1, "Pelo menos um item obrigatorio"),
  referenceId: z.string().uuid().optional().nullable(),
  referenceType: z.string().max(50).optional().nullable(),
});
export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;

// ── Create from Sale ──

export const createFromSaleSchema = z.object({
  saleId: z.string().uuid(),
  type: invoiceTypeEnum,
});
export type CreateFromSaleInput = z.infer<typeof createFromSaleSchema>;

// ── Create from Service Order ──

export const createFromServiceOrderSchema = z.object({
  serviceOrderId: z.string().uuid(),
  type: invoiceTypeEnum,
});
export type CreateFromServiceOrderInput = z.infer<typeof createFromServiceOrderSchema>;

// ── Authorize ──

export const authorizeInvoiceSchema = z.object({
  invoiceId: z.string().uuid(),
});
export type AuthorizeInvoiceInput = z.infer<typeof authorizeInvoiceSchema>;

// ── Cancel ──

export const cancelInvoiceSchema = z.object({
  invoiceId: z.string().uuid(),
  reason: z.string().min(15, "Justificativa deve ter no minimo 15 caracteres").max(255),
});
export type CancelInvoiceInput = z.infer<typeof cancelInvoiceSchema>;

// ── Correction Letter ──

export const correctionLetterSchema = z.object({
  invoiceId: z.string().uuid(),
  reason: z.string().min(15, "Correcao deve ter no minimo 15 caracteres").max(1000),
});
export type CorrectionLetterInput = z.infer<typeof correctionLetterSchema>;

// ── List ──

export const listInvoicesSchema = z.object({
  type: invoiceTypeEnum.optional(),
  status: invoiceStatusEnum.optional(),
  search: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  page: z.number().int().min(0).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
  sortBy: z.enum(["createdAt", "number", "totalAmount"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
});
export type ListInvoicesInput = z.infer<typeof listInvoicesSchema>;

// ── Download ──

export const downloadInvoiceSchema = z.object({
  invoiceId: z.string().uuid(),
  format: z.enum(["pdf", "xml"]),
});
export type DownloadInvoiceInput = z.infer<typeof downloadInvoiceSchema>;
