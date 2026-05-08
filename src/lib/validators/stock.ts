import { z } from "zod";

// ────────────────────────────────────────────────────────────────────────────
// Product
// ────────────────────────────────────────────────────────────────────────────

export const createProductSchema = z.object({
  sku: z.string().max(50).optional(),
  barcode: z.string().max(50).optional(),
  name: z.string().min(1, "Nome obrigatório").max(200),
  description: z.string().optional(),
  costPrice: z.number().min(0, "Preço de custo não pode ser negativo"),
  salePrice: z.number().min(0, "Preço de venda não pode ser negativo"),
  currentStock: z.number().int().min(0),
  minStock: z.number().int().min(0),
  unit: z.string().min(1).max(10),
  active: z.boolean(),
});

export const updateProductSchema = createProductSchema.omit({ currentStock: true }).partial();

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Product list filters
// ────────────────────────────────────────────────────────────────────────────

export const listProductsSchema = z.object({
  search: z.string().optional(),
  active: z.boolean().optional(),
  page: z.number().int().min(0),
  pageSize: z.number().int().min(1).max(100),
});

export type ListProductsInput = z.infer<typeof listProductsSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Stock Movement (adjust)
// ────────────────────────────────────────────────────────────────────────────

export const adjustStockSchema = z.object({
  productId: z.string().uuid(),
  type: z.enum(["ENTRY", "EXIT", "ADJUSTMENT"]),
  quantity: z.number().int().min(1, "Quantidade deve ser maior que zero"),
  unitCost: z.number().min(0).optional(),
  reason: z.string().optional(),
});

export type AdjustStockInput = z.infer<typeof adjustStockSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Stock Movement list
// ────────────────────────────────────────────────────────────────────────────

export const listMovementsSchema = z.object({
  productId: z.string().uuid().optional(),
  type: z.enum(["ENTRY", "EXIT", "ADJUSTMENT", "SALE", "RETURN", "TRANSFER"]).optional(),
  from: z.date().optional(),
  to: z.date().optional(),
  page: z.number().int().min(0),
  pageSize: z.number().int().min(1).max(100),
});

export type ListMovementsInput = z.infer<typeof listMovementsSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Device Purchase
// ────────────────────────────────────────────────────────────────────────────

export const createDevicePurchaseSchema = z.object({
  productId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  imei: z.string().max(20).optional(),
  serial: z.string().max(50).optional(),
  brand: z.string().max(100).optional(),
  model: z.string().max(200).optional(),
  condition: z.enum(["NEW", "USED", "REFURBISHED", "DEFECTIVE"]),
  purchasePrice: z.number().min(0, "Preço de compra não pode ser negativo"),
  notes: z.string().optional(),
});

export type CreateDevicePurchaseInput = z.infer<typeof createDevicePurchaseSchema>;

export const listDevicePurchasesSchema = z.object({
  search: z.string().optional(),
  from: z.date().optional(),
  to: z.date().optional(),
  page: z.number().int().min(0),
  pageSize: z.number().int().min(1).max(100),
});

export type ListDevicePurchasesInput = z.infer<typeof listDevicePurchasesSchema>;
