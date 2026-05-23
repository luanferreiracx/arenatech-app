import { z } from "zod";

// ── Enums ──

export const quickSaleStatusEnum = z.enum([
  "AWAITING_PAYMENT",
  "PAID",
  "CANCELLED",
  "REFUNDED",
  "EXPIRED",
]);
export type QuickSaleStatus = z.infer<typeof quickSaleStatusEnum>;

export const QUICK_SALE_STATUS_LABELS: Record<string, string> = {
  AWAITING_PAYMENT: "Aguardando Pagamento",
  PAID: "Pago",
  CANCELLED: "Cancelado",
  REFUNDED: "Estornado",
  EXPIRED: "Expirado",
};

// ── Create Quick Sale ──

export const createQuickSaleSchema = z.object({
  buyerName: z.string().max(150).optional().nullable(),
  cpfCnpj: z.string().max(18).optional().nullable(),
  phone: z.string().max(20).optional().nullable(),
  productDescription: z.string().min(5, "Descricao deve ter no minimo 5 caracteres").max(2000),
  quantity: z.number().int().min(1, "Quantidade minima 1"),
  unitPrice: z.number().int().min(1, "Valor deve ser maior que zero"), // centavos
  discount: z.number().int().min(0).optional(), // centavos
});

export type CreateQuickSaleInput = z.infer<typeof createQuickSaleSchema>;

// ── Update Quick Sale ──

export const updateQuickSaleSchema = z.object({
  id: z.string().uuid(),
  buyerName: z.string().max(150).optional().nullable(),
  cpfCnpj: z.string().max(18).optional().nullable(),
  phone: z.string().max(20).optional().nullable(),
  productDescription: z.string().min(5).max(2000).optional(),
  quantity: z.number().int().min(1).optional(),
  unitPrice: z.number().int().min(1).optional(), // centavos
  discount: z.number().int().min(0).optional(), // centavos
});

export type UpdateQuickSaleInput = z.infer<typeof updateQuickSaleSchema>;

// ── List Quick Sales ──

export const listQuickSalesSchema = z.object({
  status: quickSaleStatusEnum.optional(),
  search: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  page: z.number().int().min(0).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
});

export type ListQuickSalesInput = z.infer<typeof listQuickSalesSchema>;

// ── Generate PIX (DePix) ──

export const generateQuickSalePixSchema = z.object({
  id: z.string().uuid(),
  /** CPF/CNPJ informado pelo operador, obrigatorio quando totalAmount >= R$ 500. */
  taxId: z.string().max(20).optional().nullable(),
});

export type GenerateQuickSalePixInput = z.infer<typeof generateQuickSalePixSchema>;

// ── Check PIX status ──

export const checkQuickSalePixStatusSchema = z.object({
  id: z.string().uuid(),
  transactionId: z.string().min(1),
});

export type CheckQuickSalePixStatusInput = z.infer<typeof checkQuickSalePixStatusSchema>;
