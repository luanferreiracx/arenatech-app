import { z } from "zod";

// ── Enums ──

export const saleStatusEnum = z.enum([
  "DRAFT",
  "COMPLETED",
  "CANCELLED",
  "REFUNDED",
  "PARTIALLY_REFUNDED",
]);
export type SaleStatus = z.infer<typeof saleStatusEnum>;

export const SALE_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Rascunho",
  COMPLETED: "Finalizada",
  CANCELLED: "Cancelada",
  REFUNDED: "Estornada",
  PARTIALLY_REFUNDED: "Parcialmente Estornada",
};

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  dinheiro: "Dinheiro",
  pix: "PIX",
  cartao_credito: "Cartao Credito",
  cartao_debito: "Cartao Debito",
  misto: "Misto",
  depix: "DEPIX",
  crediario: "Crediario",
};

// ── Payment Detail (split payment) ──

export const paymentDetailSchema = z.object({
  method: z.string().min(1, "Forma de pagamento obrigatoria"),
  amount: z.number().int().min(1, "Valor deve ser maior que zero"), // centavos
  installments: z.number().int().min(1).max(36).optional(),
});

export type PaymentDetail = z.infer<typeof paymentDetailSchema>;

// ── Add Sale Item ──

export const addSaleItemSchema = z.object({
  saleId: z.string().uuid(),
  productId: z.string().uuid(),
  quantity: z.number().int().min(1, "Quantidade minima 1"),
  unitPrice: z.number().int().min(0, "Preco deve ser positivo"), // centavos
});

export type AddSaleItemInput = z.infer<typeof addSaleItemSchema>;

// ── Update Sale Item Quantity ──

export const updateSaleItemSchema = z.object({
  saleId: z.string().uuid(),
  itemId: z.string().uuid(),
  quantity: z.number().int().min(1, "Quantidade minima 1"),
});

export type UpdateSaleItemInput = z.infer<typeof updateSaleItemSchema>;

// ── Apply Discount ──

export const applyDiscountSchema = z.object({
  saleId: z.string().uuid(),
  discountType: z.enum(["fixed", "percentage"]),
  discountValue: z.number().min(0, "Valor do desconto deve ser positivo"),
  discountReason: z.string().max(200).optional().nullable(),
});

export type ApplyDiscountInput = z.infer<typeof applyDiscountSchema>;

// ── Finalize Sale ──

export const finalizeSaleSchema = z.object({
  saleId: z.string().uuid(),
  customerId: z.string().uuid().optional().nullable(),
  payments: z.array(paymentDetailSchema).min(1, "Pelo menos uma forma de pagamento"),
  observations: z.string().max(500).optional().nullable(),
});

export type FinalizeSaleInput = z.infer<typeof finalizeSaleSchema>;

// ── Cancel Sale ──

export const cancelSaleSchema = z.object({
  saleId: z.string().uuid(),
  reason: z.string().min(1, "Motivo obrigatorio").max(300),
});

export type CancelSaleInput = z.infer<typeof cancelSaleSchema>;

// ── Refund Sale ──

export const refundSaleSchema = z.object({
  saleId: z.string().uuid(),
  reason: z.string().min(1, "Motivo obrigatorio").max(300),
  returnStock: z.boolean().optional(),
});

export type RefundSaleInput = z.infer<typeof refundSaleSchema>;

// ── List Sales ──

export const listSalesSchema = z.object({
  search: z.string().optional(),
  status: saleStatusEnum.optional(),
  sellerId: z.string().uuid().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  page: z.number().int().min(0).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
  sortBy: z.enum(["saleDate", "totalAmount", "number", "createdAt"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
});

export type ListSalesInput = z.infer<typeof listSalesSchema>;

// ── Search Products (for PDV) ──

export const searchProductsSchema = z.object({
  query: z.string().min(1),
  withStock: z.boolean().optional(),
});

export type SearchProductsInput = z.infer<typeof searchProductsSchema>;
