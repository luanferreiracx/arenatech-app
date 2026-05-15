import { z } from "zod";

// ── Product schemas ──

export const createProductSchema = z.object({
  sku: z.string().max(50).optional().nullable(),
  barcode: z.string().max(50).optional().nullable(),
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres").max(200),
  description: z.string().max(2000).optional().nullable(),
  brand: z.string().max(100).optional().nullable(),
  isDevice: z.boolean().optional(),
  costPrice: z.number().int().min(0, "Preco de custo deve ser positivo"), // centavos
  salePrice: z.number().int().min(0, "Preco de venda deve ser positivo"), // centavos
  promotionalPrice: z.number().int().min(0).optional().nullable(), // centavos
  minStock: z.number().int().min(0).optional(),
  unit: z.string().max(10).optional(),
  active: z.boolean().optional(),
  categoryId: z.string().uuid().optional().nullable(),
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

// ── Supplier (Fornecedor) schemas ──

export const createSupplierSchema = z.object({
  type: z.enum(["PF", "PJ"]),
  name: z.string().min(2, "Nome e obrigatorio").max(200),
  tradeName: z.string().max(200).optional().nullable(),
  cpfCnpj: z.string().max(18).optional().nullable(),
  phone: z.string().max(20).optional().nullable(),
  email: z.string().email("Email invalido").max(200).optional().nullable().or(z.literal("")),
  notes: z.string().max(2000).optional().nullable(),
  active: z.boolean().optional(),
  address: z.object({
    zipCode: z.string().max(10).optional().nullable(),
    street: z.string().max(200).optional().nullable(),
    number: z.string().max(20).optional().nullable(),
    complement: z.string().max(200).optional().nullable(),
    neighborhood: z.string().max(100).optional().nullable(),
    city: z.string().max(100).optional().nullable(),
    state: z.string().max(2).optional().nullable(),
  }).optional().nullable(),
});

export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;

export const updateSupplierSchema = createSupplierSchema.extend({
  id: z.string().uuid(),
});

export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>;

export const listSuppliersSchema = z.object({
  search: z.string().optional(),
  active: z.boolean().optional(),
  page: z.number().int().min(0).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
});

export type ListSuppliersInput = z.infer<typeof listSuppliersSchema>;

// ── Product Category schemas ──

export const createCategorySchema = z.object({
  name: z.string().min(1, "Nome e obrigatorio").max(100),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

export const updateCategorySchema = createCategorySchema.extend({
  id: z.string().uuid(),
});

export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

export const listCategoriesSchema = z.object({
  search: z.string().optional(),
  page: z.number().int().min(0).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
});

export type ListCategoriesInput = z.infer<typeof listCategoriesSchema>;

// ── Stock Entry/Exit schemas ──

export const stockEntrySchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().min(1, "Quantidade minima e 1"),
  unitCost: z.number().int().min(0).optional(),
  reason: z.string().min(1, "Motivo obrigatorio").max(200),
  supplierId: z.string().uuid().optional().nullable(),
});

export type StockEntryInput = z.infer<typeof stockEntrySchema>;

export const stockExitSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().min(1, "Quantidade minima e 1"),
  reason: z.string().min(1, "Motivo obrigatorio").max(200),
});

export type StockExitInput = z.infer<typeof stockExitSchema>;

// ── Report schemas ──

export const reportDateRangeSchema = z.object({
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

export type ReportDateRangeInput = z.infer<typeof reportDateRangeSchema>;

export const posicaoEstoqueSchema = z.object({
  categoryId: z.string().uuid().optional(),
  onlyWithStock: z.boolean().optional(),
});

export type PosicaoEstoqueInput = z.infer<typeof posicaoEstoqueSchema>;

export const movimentacoesReportSchema = reportDateRangeSchema.extend({
  type: z.enum(["ENTRY", "EXIT", "ADJUSTMENT", "SALE", "RETURN", "TRANSFER"]).optional(),
  productId: z.string().uuid().optional(),
});

export type MovimentacoesReportInput = z.infer<typeof movimentacoesReportSchema>;

export const curvaAbcSchema = reportDateRangeSchema.extend({
  categoryId: z.string().uuid().optional(),
});

export type CurvaAbcInput = z.infer<typeof curvaAbcSchema>;

export const estoqueMinSchema = z.object({
  categoryId: z.string().uuid().optional(),
  onlyBelowMin: z.boolean().optional(),
});

export type EstoqueMinInput = z.infer<typeof estoqueMinSchema>;

export const vendasPeriodoSchema = reportDateRangeSchema.extend({
  sellerId: z.string().uuid().optional(),
});

export type VendasPeriodoInput = z.infer<typeof vendasPeriodoSchema>;

export const vendasProdutoSchema = reportDateRangeSchema.extend({
  categoryId: z.string().uuid().optional(),
});

export type VendasProdutoInput = z.infer<typeof vendasProdutoSchema>;

export const vendasVendedorSchema = reportDateRangeSchema;

export type VendasVendedorInput = z.infer<typeof vendasVendedorSchema>;

export const upgradesSchema = reportDateRangeSchema.extend({
  sellerId: z.string().uuid().optional(),
});

export type UpgradesInput = z.infer<typeof upgradesSchema>;

export const csvImportLineSchema = z.object({
  name: z.string().min(1, "Nome obrigatorio"),
  sku: z.string().optional(),
  barcode: z.string().optional(),
  brand: z.string().optional(),
  category: z.string().optional(),
  costPrice: z.number().min(0).optional(),
  salePrice: z.number().min(0, "Preco de venda obrigatorio"),
  promotionalPrice: z.number().min(0).optional(),
  minStock: z.number().int().min(0).optional(),
  quantity: z.number().int().min(0).optional(),
  isDevice: z.boolean().optional(),
  description: z.string().optional(),
});

export type CsvImportLineInput = z.infer<typeof csvImportLineSchema>;

export const csvImportSchema = z.object({
  lines: z.array(csvImportLineSchema).min(1, "Pelo menos uma linha obrigatoria"),
});

export type CsvImportInput = z.infer<typeof csvImportSchema>;

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
