import { z } from "zod";

// ────────────────────────────────────────────────────────────────────────────
// Payment detail (for split payment)
// ────────────────────────────────────────────────────────────────────────────

export const paymentDetailSchema = z.object({
  method: z.string().min(1, "Forma de pagamento obrigatória"),
  amount: z.number().positive("Valor deve ser positivo"),
  installments: z.number().int().min(1).optional(),
});

export type PaymentDetail = z.infer<typeof paymentDetailSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Add item to cart
// ────────────────────────────────────────────────────────────────────────────

export const addSaleItemSchema = z.object({
  saleId: z.string().uuid(),
  productId: z.string().uuid(),
  quantity: z.number().int().positive("Quantidade deve ser positiva"),
  unitPrice: z.number().min(0, "Preço unitário não pode ser negativo"),
  discount: z.number().min(0).optional(),
});

export type AddSaleItemInput = z.infer<typeof addSaleItemSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Update item quantity
// ────────────────────────────────────────────────────────────────────────────

export const updateSaleItemSchema = z.object({
  itemId: z.string().uuid(),
  quantity: z.number().int().positive("Quantidade deve ser positiva"),
});

export type UpdateSaleItemInput = z.infer<typeof updateSaleItemSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Apply discount
// ────────────────────────────────────────────────────────────────────────────

export const applyDiscountSchema = z.object({
  saleId: z.string().uuid(),
  discountType: z.enum(["fixed", "percent"]),
  discountValue: z.number().min(0, "Desconto não pode ser negativo"),
});

export type ApplyDiscountInput = z.infer<typeof applyDiscountSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Finalize sale
// ────────────────────────────────────────────────────────────────────────────

export const finalizeSaleSchema = z.object({
  saleId: z.string().uuid(),
  customerId: z.string().uuid().optional(),
  payments: z.array(paymentDetailSchema).min(1, "Pelo menos uma forma de pagamento"),
  discountType: z.enum(["fixed", "percent"]).optional(),
  discountValue: z.number().min(0).optional(),
});

export type FinalizeSaleInput = z.infer<typeof finalizeSaleSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Cancel sale
// ────────────────────────────────────────────────────────────────────────────

export const cancelSaleSchema = z.object({
  saleId: z.string().uuid(),
  reason: z.string().optional(),
});

export type CancelSaleInput = z.infer<typeof cancelSaleSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Refund sale
// ────────────────────────────────────────────────────────────────────────────

export const refundSaleSchema = z.object({
  saleId: z.string().uuid(),
  reason: z.string().min(1, "Motivo do estorno obrigatório"),
});

export type RefundSaleInput = z.infer<typeof refundSaleSchema>;

// ────────────────────────────────────────────────────────────────────────────
// List sales
// ────────────────────────────────────────────────────────────────────────────

export const listSalesSchema = z.object({
  page: z.number().int().min(0),
  pageSize: z.number().int().min(1).max(100),
  search: z.string().optional(),
  status: z.enum(["DRAFT", "COMPLETED", "CANCELLED", "REFUNDED"]).optional(),
  sellerId: z.string().uuid().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

export type ListSalesInput = z.infer<typeof listSalesSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Sale status labels and variants (for UI)
// ────────────────────────────────────────────────────────────────────────────

export const SALE_STATUSES = ["DRAFT", "COMPLETED", "CANCELLED", "REFUNDED"] as const;
export type SaleStatusValue = (typeof SALE_STATUSES)[number];

export const SALE_STATUS_LABELS: Record<SaleStatusValue, string> = {
  DRAFT: "Rascunho",
  COMPLETED: "Finalizada",
  CANCELLED: "Cancelada",
  REFUNDED: "Estornada",
};

export const SALE_STATUS_VARIANTS: Record<SaleStatusValue, "default" | "success" | "warning" | "destructive" | "info"> = {
  DRAFT: "warning",
  COMPLETED: "success",
  CANCELLED: "destructive",
  REFUNDED: "info",
};
