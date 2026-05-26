import { z } from "zod";

// ── Product schemas ──

// Schemas auxiliares — fotos/variacoes/atributos sao criados junto com o
// produto numa unica transacao (paridade Laravel ProdutoController::store).

export const productPhotoInputSchema = z.object({
  url: z.string().url(),
  thumbUrl: z.string().url().optional().nullable(),
  mediumUrl: z.string().url().optional().nullable(),
  order: z.number().int().min(0).optional(),
  isPrimary: z.boolean().optional(),
});
export type ProductPhotoInput = z.infer<typeof productPhotoInputSchema>;

export const productVariationInputSchema = z.object({
  sku: z.string().max(50).optional().nullable(),
  barcode: z.string().max(50).optional().nullable(),
  costPrice: z.number().int().min(0).optional().nullable(), // centavos
  salePrice: z.number().int().min(0).optional().nullable(), // centavos
  promotionalPrice: z.number().int().min(0).optional().nullable(), // centavos
  minStock: z.number().int().min(0).optional(),
  imageUrl: z.string().url().optional().nullable(),
  active: z.boolean().optional(),
  /** IDs de ProductAttributeValue (ex: [valor "Azul", valor "128GB"]) */
  attributeValueIds: z.array(z.string().uuid()).min(1),
});
export type ProductVariationInput = z.infer<typeof productVariationInputSchema>;

export const createProductSchema = z.object({
  sku: z.string().max(50).optional().nullable(),
  barcode: z.string().max(50).optional().nullable(),
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres").max(200),
  description: z.string().max(2000).optional().nullable(),
  brand: z.string().max(100).optional().nullable(),
  ncm: z.string().regex(/^\d{8}$/, "NCM deve ter 8 digitos").optional().nullable(),
  cest: z.string().max(10).optional().nullable(),
  isSerialized: z.boolean().optional(),
  isPremium: z.boolean().optional(),
  isDevice: z.boolean().optional(),
  hasVariations: z.boolean().optional(),
  icmsDifferentialRate: z.number().min(0).max(100).optional().nullable(),
  costPrice: z.number().int().min(0, "Preco de custo deve ser positivo"), // centavos
  salePrice: z.number().int().min(0, "Preco de venda deve ser positivo"), // centavos
  promotionalPrice: z.number().int().min(0).optional().nullable(), // centavos
  defaultMargin: z.number().min(0).max(100).optional().nullable(),
  minStock: z.number().int().min(0).optional(),
  unit: z.string().max(10).optional(),
  active: z.boolean().optional(),
  categoryId: z.string().uuid().optional().nullable(),
  categoryIds: z.array(z.string().uuid()).min(1).max(3).optional(),
  /**
   * Cria uma categoria nova no submit (paridade Laravel `nova_categoria`).
   * A categoria criada eh adicionada como primaria (a frente das categoryIds).
   */
  newCategoryName: z.string().min(2).max(100).optional().nullable(),
  /** Fotos a criar (URLs ja uploaded via presigned MinIO). Max 3. */
  photos: z.array(productPhotoInputSchema).max(3).optional(),
  /** IDs dos atributos que o produto usa (ex: cor, capacidade) */
  attributeConfigIds: z.array(z.string().uuid()).optional(),
  /** Variacoes do produto (cor + capacidade + preco proprio) */
  variations: z.array(productVariationInputSchema).optional(),
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
  sortBy: z.enum(["name", "salePrice", "createdAt"]).optional(),
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
  type: z.enum(["ENTRY", "EXIT", "ADJUSTMENT", "RESERVE", "RELEASE"]).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  page: z.number().int().min(0).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
});

export type ListMovementsInput = z.infer<typeof listMovementsSchema>;

// ── Device Purchase schemas ──

export const createDevicePurchaseSchema = z.object({
  // productId AGORA OBRIGATORIO. Operador escolhe um Product cadastrado
  // (combobox) ou cria pela tela de Produtos antes. Paridade Laravel:
  // sem digitar marca/modelo livre — evita duplicatas e garante que o
  // aparelho aparece no PDV.
  productId: z.string().uuid("Selecione o produto"),
  customerId: z.string().uuid().optional().nullable(),
  supplierId: z.string().uuid().optional().nullable(),
  sellerType: z.enum(["customer", "supplier"]).optional(),
  imei: z.string().max(20).optional().nullable(),
  serial: z.string().max(50).optional().nullable(),
  // brand/model: removidos do input — extraidos de Product.brand + Product.name
  // no backend pra preencher DevicePurchase (legado).
  condition: z.enum(["NEW", "SEMI_NEW", "USED", "DISPLAY", "REFURBISHED", "DEFECTIVE"]),
  batteryHealth: z.number().int().min(0).max(100).optional().nullable(),
  purchasePrice: z.number().int().min(0, "Preco de compra deve ser positivo"), // centavos
  salePrice: z.number().int().min(0).optional().nullable(), // centavos
  notes: z.string().max(500).optional().nullable(),
  // Quando true, gera conta a pagar (PAYABLE) automaticamente com o valor da compra
  generatePayable: z.boolean().optional(),
  payableInstallments: z.number().int().min(1).max(36).optional(),
  payableFirstDueDate: z.string().optional(),
});

export type CreateDevicePurchaseInput = z.infer<typeof createDevicePurchaseSchema>;

export const listDevicePurchasesSchema = z.object({
  search: z.string().optional(),
  condition: z.enum(["NEW", "SEMI_NEW", "USED", "DISPLAY", "REFURBISHED", "DEFECTIVE"]).optional(),
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
  cpf: z.string().max(14).optional().nullable(),
  cnpj: z.string().max(18).optional().nullable(),
  phone: z.string().max(20).optional().nullable(),
  email: z.string().email("Email invalido").max(200).optional().nullable().or(z.literal("")),
  notes: z.string().max(2000).optional().nullable(),
  active: z.boolean().optional(),
  zipCode: z.string().max(10).optional().nullable(),
  street: z.string().max(200).optional().nullable(),
  streetNumber: z.string().max(20).optional().nullable(),
  complement: z.string().max(200).optional().nullable(),
  neighborhood: z.string().max(100).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  state: z.string().max(2).optional().nullable(),
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
  description: z.string().max(500).optional().nullable(),
  badgeColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Cor invalida").optional(),
  active: z.boolean().optional(),
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
  /** Obrigatorio quando product.has_variations = true. */
  variationId: z.string().uuid().optional().nullable(),
  quantity: z.number().int().min(1, "Quantidade minima e 1"),
  unitCost: z.number().int().min(0).optional(),
  reason: z.string().min(1, "Motivo obrigatorio").max(200),
  supplierId: z.string().uuid().optional().nullable(),
});

export type StockEntryInput = z.infer<typeof stockEntrySchema>;

/**
 * Motivos de baixa de estoque — paridade Laravel EstoqueMovimentacao::MOTIVOS_BAIXA.
 * Use o `code` no `reason` salvo no banco (prefixo) e o `label` na UI.
 */
export const STOCK_WRITEOFF_REASONS = [
  { code: "consumo_proprio", label: "Consumo proprio" },
  { code: "brinde", label: "Brinde / Doacao" },
  { code: "danificado", label: "Danificado / Avariado" },
  { code: "perda", label: "Perda / Extravio" },
  { code: "furto", label: "Furto / Roubo" },
  { code: "devolucao_fornecedor", label: "Devolucao ao fornecedor" },
  { code: "obsoleto", label: "Obsoleto" },
  { code: "outro", label: "Outro" },
] as const;

export type StockWriteOffReasonCode = (typeof STOCK_WRITEOFF_REASONS)[number]["code"];

export const stockExitSchema = z.object({
  productId: z.string().uuid(),
  /** Obrigatorio quando product.has_variations = true. */
  variationId: z.string().uuid().optional().nullable(),
  quantity: z.number().int().min(1, "Quantidade minima e 1"),
  reason: z.string().min(1, "Motivo obrigatorio").max(200),
});

export type StockExitInput = z.infer<typeof stockExitSchema>;

// ── Bulk adjustment ──

export const bulkAdjustItemSchema = z.object({
  productId: z.string().uuid(),
  newQuantity: z.number().int().min(0),
});

export const bulkAdjustStockSchema = z.object({
  items: z.array(bulkAdjustItemSchema).min(1, "Adicione ao menos um produto"),
  reason: z.string().min(1, "Motivo obrigatorio").max(200),
});

export type BulkAdjustStockInput = z.infer<typeof bulkAdjustStockSchema>;

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
  type: z.enum(["ENTRY", "EXIT", "ADJUSTMENT", "RESERVE", "RELEASE"]).optional(),
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
  // Valores em CENTAVOS. int() bloqueia float que gera Decimal fracionario
  // (ex: 1500.5 cents -> 15.005 reais -> arredonda inconsistente).
  costPrice: z.number().int().min(0).optional(),
  salePrice: z.number().int().min(0, "Preco de venda obrigatorio"),
  promotionalPrice: z.number().int().min(0).optional(),
  minStock: z.number().int().min(0).optional(),
  quantity: z.number().int().min(0).optional(),
  isSerialized: z.boolean().optional(),
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
  RESERVE: "Reserva",
  RELEASE: "Liberacao",
};

/**
 * Ordem espelhada da intranetpdv Laravel: novo > seminovo > usado > vitrine.
 * Recondicionado/Defeituoso ficam no fim — sao casos raros.
 */
export const deviceConditionLabels: Record<string, string> = {
  NEW: "Novo",
  SEMI_NEW: "Seminovo",
  USED: "Usado",
  DISPLAY: "Vitrine",
  REFURBISHED: "Recondicionado",
  DEFECTIVE: "Defeituoso",
};

// ── Product Attribute schemas ──

export const createAttributeSchema = z.object({
  name: z.string().min(1, "Nome e obrigatorio").max(50),
  order: z.number().int().min(0).optional(),
  active: z.boolean().optional(),
});

export type CreateAttributeInput = z.infer<typeof createAttributeSchema>;

export const updateAttributeSchema = createAttributeSchema.extend({
  id: z.string().uuid(),
});

export type UpdateAttributeInput = z.infer<typeof updateAttributeSchema>;

export const listAttributesSchema = z.object({
  active: z.boolean().optional(),
});

export type ListAttributesInput = z.infer<typeof listAttributesSchema>;

// ── Product Attribute Value schemas ──

export const createAttributeValueSchema = z.object({
  attributeId: z.string().uuid(),
  value: z.string().min(1, "Valor e obrigatorio").max(100),
  displayValue: z.string().max(100).optional().nullable(),
  code: z.string().max(20).optional().nullable(),
  order: z.number().int().min(0).optional(),
  active: z.boolean().optional(),
});

export type CreateAttributeValueInput = z.infer<typeof createAttributeValueSchema>;

export const updateAttributeValueSchema = z.object({
  id: z.string().uuid(),
  value: z.string().min(1).max(100).optional(),
  displayValue: z.string().max(100).optional().nullable(),
  code: z.string().max(20).optional().nullable(),
  order: z.number().int().min(0).optional(),
  active: z.boolean().optional(),
});

export type UpdateAttributeValueInput = z.infer<typeof updateAttributeValueSchema>;

// ── Product Variation schemas ──

export const createVariationSchema = z.object({
  productId: z.string().uuid(),
  sku: z.string().max(50).optional().nullable(),
  barcode: z.string().max(50).optional().nullable(),
  costPrice: z.number().int().min(0).optional().nullable(), // centavos
  salePrice: z.number().int().min(0).optional().nullable(), // centavos
  promotionalPrice: z.number().int().min(0).optional().nullable(), // centavos
  minStock: z.number().int().min(0).optional(),
  active: z.boolean().optional(),
  attributeValueIds: z.array(z.string().uuid()).min(1, "Selecione ao menos 1 valor de atributo"),
});

export type CreateVariationInput = z.infer<typeof createVariationSchema>;

export const updateVariationSchema = z.object({
  id: z.string().uuid(),
  sku: z.string().max(50).optional().nullable(),
  barcode: z.string().max(50).optional().nullable(),
  costPrice: z.number().int().min(0).optional().nullable(),
  salePrice: z.number().int().min(0).optional().nullable(),
  promotionalPrice: z.number().int().min(0).optional().nullable(),
  minStock: z.number().int().min(0).optional(),
  active: z.boolean().optional(),
  attributeValueIds: z.array(z.string().uuid()).min(1).optional(),
});

export type UpdateVariationInput = z.infer<typeof updateVariationSchema>;

export const listVariationsSchema = z.object({
  productId: z.string().uuid(),
  active: z.boolean().optional(),
});

export type ListVariationsInput = z.infer<typeof listVariationsSchema>;

// ── Product Photo schemas ──

export const createPhotoSchema = z.object({
  productId: z.string().uuid(),
  url: z.string().url(),
  thumbUrl: z.string().url().optional().nullable(),
  mediumUrl: z.string().url().optional().nullable(),
  order: z.number().int().min(0).optional(),
  isPrimary: z.boolean().optional(),
});

export type CreatePhotoInput = z.infer<typeof createPhotoSchema>;

export const reorderPhotosSchema = z.object({
  productId: z.string().uuid(),
  photoIds: z.array(z.string().uuid()),
});

export type ReorderPhotosInput = z.infer<typeof reorderPhotosSchema>;

export const setPrimaryPhotoSchema = z.object({
  productId: z.string().uuid(),
  photoId: z.string().uuid(),
});

export type SetPrimaryPhotoInput = z.infer<typeof setPrimaryPhotoSchema>;

// ── NCM search schema ──

export const searchNcmSchema = z.object({
  term: z.string().min(3, "Minimo 3 caracteres").max(100),
});

export type SearchNcmInput = z.infer<typeof searchNcmSchema>;

// ── CNPJ lookup schema ──

export const lookupCnpjSchema = z.object({
  cnpj: z.string().min(14).max(18),
});

export type LookupCnpjInput = z.infer<typeof lookupCnpjSchema>;

// ── Duplicate product schema ──

export const duplicateProductSchema = z.object({
  productId: z.string().uuid(),
  newSku: z.string().max(50).optional().nullable(),
  newName: z.string().min(2).max(200).optional(),
});

export type DuplicateProductInput = z.infer<typeof duplicateProductSchema>;
