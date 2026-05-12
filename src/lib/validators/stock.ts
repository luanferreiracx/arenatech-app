import { z } from "zod";

// ── Product schemas ──

export const createProductSchema = z.object({
  sku: z.string().max(50).optional().nullable(),
  barcode: z.string().max(50).optional().nullable(),
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres").max(200),
  description: z.string().max(2000).optional().nullable(),
  costPrice: z.number().int().min(0, "Preco de custo deve ser positivo"), // centavos
  salePrice: z.number().int().min(0, "Preco de venda deve ser positivo"), // centavos
  minStock: z.number().int().min(0).optional(),
  unit: z.string().max(10).optional(),
  active: z.boolean().optional(),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;

export const updateProductSchema = createProductSchema.extend({
  id: z.string().uuid(),
});

export type UpdateProductInput = z.infer<typeof updateProductSchema>;

export const listProductsSchema = z.object({
  search: z.string().optional(),
  active: z.boolean().optional(),
  lowStock: z.boolean().optional(),
  page: z.number().int().min(0).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
  sortBy: z.enum(["name", "currentStock", "salePrice", "createdAt"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
});

export type ListProductsInput = z.infer<typeof listProductsSchema>;

// ── Stock Adjustment schemas ──

export const adjustStockSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().refine((v) => v !== 0, "Quantidade nao pode ser zero"),
  reason: z.string().min(1, "Motivo obrigatorio").max(200),
});

export type AdjustStockInput = z.infer<typeof adjustStockSchema>;

// ── Stock Movement schemas ──

export const listMovementsSchema = z.object({
  productId: z.string().uuid().optional(),
  type: z.enum(["ENTRY", "EXIT", "ADJUSTMENT", "SALE", "RETURN", "TRANSFER"]).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  page: z.number().int().min(0).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
});

export type ListMovementsInput = z.infer<typeof listMovementsSchema>;

// ── Device Purchase schemas ──

export const createDevicePurchaseSchema = z.object({
  productId: z.string().uuid().optional().nullable(),
  customerId: z.string().uuid().optional().nullable(),
  imei: z.string().max(20).optional().nullable(),
  serial: z.string().max(50).optional().nullable(),
  brand: z.string().max(100).optional().nullable(),
  model: z.string().max(200).optional().nullable(),
  condition: z.enum(["NEW", "USED", "REFURBISHED", "DEFECTIVE"]),
  batteryHealth: z.number().int().min(0).max(100).optional().nullable(),
  purchasePrice: z.number().int().min(0, "Preco de compra deve ser positivo"), // centavos
  salePrice: z.number().int().min(0).optional().nullable(), // centavos
  notes: z.string().max(500).optional().nullable(),
});

export type CreateDevicePurchaseInput = z.infer<typeof createDevicePurchaseSchema>;

export const listDevicePurchasesSchema = z.object({
  search: z.string().optional(),
  condition: z.enum(["NEW", "USED", "REFURBISHED", "DEFECTIVE"]).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  page: z.number().int().min(0).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
});

export type ListDevicePurchasesInput = z.infer<typeof listDevicePurchasesSchema>;

// ── Labels ──

export const stockMovementTypeLabels: Record<string, string> = {
  ENTRY: "Entrada",
  EXIT: "Saida",
  ADJUSTMENT: "Ajuste",
  SALE: "Venda",
  RETURN: "Devolucao",
  TRANSFER: "Transferencia",
};

export const deviceConditionLabels: Record<string, string> = {
  NEW: "Novo",
  USED: "Usado",
  REFURBISHED: "Recondicionado",
  DEFECTIVE: "Defeituoso",
};
