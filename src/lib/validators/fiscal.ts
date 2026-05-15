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

// ── Update Invoice (edit) ──

export const updateInvoiceSchema = z.object({
  invoiceId: z.string().uuid(),
  recipientName: z.string().min(1, "Nome obrigatorio").max(200).optional(),
  recipientCpfCnpj: z.string().min(11).max(18).optional(),
  recipientEmail: z.string().email().max(200).optional().nullable(),
  recipientPhone: z.string().max(20).optional().nullable(),
  // Address
  recipientZipCode: z.string().max(10).optional().nullable(),
  recipientStreet: z.string().max(200).optional().nullable(),
  recipientNumber: z.string().max(20).optional().nullable(),
  recipientComplement: z.string().max(200).optional().nullable(),
  recipientNeighborhood: z.string().max(100).optional().nullable(),
  recipientCity: z.string().max(100).optional().nullable(),
  recipientState: z.string().max(2).optional().nullable(),
  // Values
  freightAmount: z.number().int().min(0).optional(),
  insuranceAmount: z.number().int().min(0).optional(),
  otherExpenses: z.number().int().min(0).optional(),
  discountAmount: z.number().int().min(0).optional(),
  freightMode: z.string().max(10).optional().nullable(),
  paymentForm: z.string().max(50).optional().nullable(),
  additionalInfo: z.string().max(5000).optional().nullable(),
});
export type UpdateInvoiceInput = z.infer<typeof updateInvoiceSchema>;

// ── Add Invoice Item ──

export const addInvoiceItemSchema = z.object({
  invoiceId: z.string().uuid(),
  description: z.string().min(1, "Descricao obrigatoria").max(500),
  code: z.string().max(50).optional().nullable(),
  ncm: z.string().max(10).optional().nullable(),
  cfop: z.string().max(10).optional().nullable(),
  unit: z.string().max(10).optional(),
  quantity: z.number().min(0.01, "Quantidade minima 0.01"),
  unitPrice: z.number().int().min(1, "Preco unitario obrigatorio"),
  discountAmount: z.number().int().min(0).optional(),
});
export type AddInvoiceItemInput = z.infer<typeof addInvoiceItemSchema>;

// ── Remove Invoice Item ──

export const removeInvoiceItemSchema = z.object({
  invoiceId: z.string().uuid(),
  itemId: z.string().uuid(),
});
export type RemoveInvoiceItemInput = z.infer<typeof removeInvoiceItemSchema>;

// ── Inutilizar Numeracao ──

export const inutilizarSchema = z.object({
  model: z.enum(["55", "65"]),
  series: z.string().min(1).max(3),
  startNumber: z.number().int().min(1, "Numero inicial obrigatorio"),
  endNumber: z.number().int().min(1, "Numero final obrigatorio"),
  justification: z.string().min(15, "Justificativa deve ter no minimo 15 caracteres").max(255),
});
export type InutilizarInput = z.infer<typeof inutilizarSchema>;

// ── Create entrada (NF-e de entrada) ──

export const createEntradaSchema = z.object({
  supplierName: z.string().min(1, "Nome do remetente obrigatorio").max(200),
  supplierCpfCnpj: z.string().min(11, "CPF/CNPJ obrigatorio").max(18),
  supplierEmail: z.string().email().max(200).optional().nullable(),
  supplierPhone: z.string().max(20).optional().nullable(),
  supplierId: z.string().uuid().optional().nullable(),
  // Address
  zipCode: z.string().max(10).optional().nullable(),
  street: z.string().max(200).optional().nullable(),
  number: z.string().max(20).optional().nullable(),
  complement: z.string().max(200).optional().nullable(),
  neighborhood: z.string().max(100).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  state: z.string().max(2).optional().nullable(),
  // Operation
  freightMode: z.string().max(10).optional(),
  freightAmount: z.number().int().min(0).optional(),
  insuranceAmount: z.number().int().min(0).optional(),
  otherExpenses: z.number().int().min(0).optional(),
  additionalInfo: z.string().max(5000).optional().nullable(),
});
export type CreateEntradaInput = z.infer<typeof createEntradaSchema>;

// ── Send Email ──

export const sendInvoiceEmailSchema = z.object({
  invoiceId: z.string().uuid(),
  email: z.string().email("Email invalido"),
});
export type SendInvoiceEmailInput = z.infer<typeof sendInvoiceEmailSchema>;
