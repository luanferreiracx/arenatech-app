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
  /** Codigo da forma de pagamento (ex: "dinheiro", "pix", "cartao_credito"). */
  method: z.string().min(1, "Forma de pagamento obrigatoria"),
  /** Id da PaymentMethod (opcional — quando informado, calcula taxas/politica). */
  paymentMethodId: z.string().uuid().optional().nullable(),
  /**
   * Recebimento por cartão (opcional). Quando informado junto de `cardBrandId`
   * e `cardKind`, gera CardReceivable(s) com taxa/líquido/prazo D+N da
   * AcquirerRate. Sem isso, a venda no cartão segue como hoje (sem recebível).
   */
  acquirerId: z.string().uuid().optional().nullable(),
  cardBrandId: z.string().uuid().optional().nullable(),
  cardKind: z.enum(["CREDIT", "DEBIT"]).optional().nullable(),
  /**
   * Valor da mercadoria desta forma de pagamento (centavos). Ex: numa venda
   * de R$ 1.000 pagando 30% pix + 70% cartao, o pix tem amount=30000 e o
   * cartao amount=70000.
   */
  amount: z.number().int().min(1, "Valor deve ser maior que zero"),
  installments: z.number().int().min(1).max(36).optional(),
  /**
   * Valor total que o cliente paga DE FATO nesta forma (centavos). Maior
   * que `amount` quando ha acrescimo (politica CLIENTE_PAGA). Operador
   * digita o valor que aparece na maquininha. Default = amount.
   */
  totalPaidByCustomer: z.number().int().min(0).optional(),
  /** Operador assumiu recebimento manual do DePix; nao ha QR/wallet a validar. */
  depixManual: z.boolean().optional(),
  /** ID canonico da transacao wallet quando method = "depix". */
  walletTransactionId: z.string().uuid().optional().nullable(),
  /**
   * ID da transacao PixPay/DePix (quando method = "depix"). Persistido em
   * paymentDetails JSON para o webhook localizar a venda quando o pagamento
   * confirma. Sem esse campo, vendas pagas via DePix ficam orfas eternamente.
   */
  depixTransactionId: z.string().optional().nullable(),
});

export type PaymentDetail = z.infer<typeof paymentDetailSchema>;

// ── Add Sale Item ──

export const addSaleItemSchema = z.object({
  saleId: z.string().uuid(),
  productId: z.string().uuid(),
  // Para produtos serializados (isSerialized=true), `stockItemId` e obrigatorio
  // — operador escolhe qual aparelho (IMEI) esta vendendo.
  stockItemId: z.string().uuid().optional().nullable(),
  // Para produtos com has_variations=true, `variationId` e obrigatorio
  // — operador escolhe qual variacao (cor, tamanho, etc) esta vendendo.
  variationId: z.string().uuid().optional().nullable(),
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
  payments: z.array(paymentDetailSchema).optional(),
  // Forma da devolucao quando refundDueAmount > 0 (downgrade). Obrigatorio
  // se a venda tem refundDue. Paridade Laravel `forma_devolucao`.
  refundDueMethod: z.enum(["cash", "pix", "depix"]).optional(),
  /**
   * Chave PIX do cliente para devolucao (downgrade em PIX ou DePix).
   * Em `depix`, dispara saque automatico via PixPay. Em `pix` simples,
   * fica registrado pra operador transferir manual.
   */
  refundDuePixKey: z.string().max(100).optional().nullable(),
  refundDuePixKeyType: z.enum(["CPF", "CNPJ", "EMAIL", "PHONE", "RANDOM"]).optional().nullable(),
  observations: z.string().max(500).optional().nullable(),
}).refine(
  (d) => {
    // Max 1 pagamento DePix por venda — multiplos QRs = UX confusa, ja
    // bloqueado no frontend mas o validator defende o backend.
    const depixCount = (d.payments ?? []).filter((p) => p.method === "depix").length;
    return depixCount <= 1;
  },
  { message: "So e permitido 1 pagamento DePix por venda.", path: ["payments"] },
);

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
  /**
   * Quando true, StockItems serializados voltam como `DEFECTIVE` em vez de
   * `AVAILABLE`. Util para devolucao por defeito do aparelho. Paridade
   * Laravel `devolverItemComoDefeito`.
   */
  returnAsDefect: z.boolean().optional(),
  /**
   * Estorno PARCIAL: lista de ids de SaleItems a estornar. Quando omitido,
   * estorna tudo (refund total). Paridade Laravel estornarParcial.
   */
  itemIds: z.array(z.string().uuid()).optional(),
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

// ── Update Item Price (override) ──

export const updateItemPriceSchema = z.object({
  saleId: z.string().uuid(),
  itemId: z.string().uuid(),
  unitPrice: z.number().int().min(0, "Preco deve ser positivo"), // centavos
});

export type UpdateItemPriceInput = z.infer<typeof updateItemPriceSchema>;

// ── Create Sale from OS (pagamento de OS via PDV) ──

export const createFromOSSchema = z.object({
  serviceOrderId: z.string().uuid(),
});

export type CreateFromOSInput = z.infer<typeof createFromOSSchema>;

// ── Send Receipt via WhatsApp ──

export const sendSaleReceiptSchema = z.object({
  saleId: z.string().uuid(),
  phone: z.string().min(8).max(30).optional().nullable(),
});

export type SendSaleReceiptInput = z.infer<typeof sendSaleReceiptSchema>;

// ── Signature (Autentique + physical) ──

export const sendSaleSignatureSchema = z.object({
  saleId: z.string().uuid(),
  phone: z.string().min(8).max(30).optional().nullable(),
});

export const confirmSalePhysicalSignatureSchema = z.object({
  saleId: z.string().uuid(),
});

export const checkSaleSignatureStatusSchema = z.object({
  saleId: z.string().uuid(),
});

// ── Search Products (for PDV) ──

export const searchProductsSchema = z.object({
  query: z.string().min(1),
  withStock: z.boolean().optional(),
});

export type SearchProductsInput = z.infer<typeof searchProductsSchema>;

// ── Upgrade (aparelho de entrada / trade-in) ──

export const addSaleUpgradeSchema = z.object({
  saleId: z.string().uuid(),
  brand: z.string().max(100).optional().nullable(),
  model: z.string().min(1).max(100),
  /** Capacidade ex: "128GB", "256GB", "1TB". Opcional. */
  storage: z.string().max(20).optional().nullable(),
  /** Cor do aparelho. Opcional. */
  color: z.string().max(50).optional().nullable(),
  imei: z.string().max(20).optional().nullable(),
  serialNumber: z.string().max(50).optional().nullable(),
  /** Condicoes alinhadas com StockItemCondition. */
  condition: z.enum(["NEW", "SEMI_NEW", "USED", "DISPLAY"]).default("USED"),
  batteryHealth: z.number().int().min(0).max(100).optional().nullable(),
  appraisedValue: z.number().int().min(0),  // centavos
  abatedValue: z.number().int().min(0),     // centavos (quanto abate da venda)
  notes: z.string().max(500).optional().nullable(),
}).refine((d) => d.abatedValue <= d.appraisedValue, {
  message: "O valor abatido nao pode ser maior que o valor avaliado.",
  path: ["abatedValue"],
}).refine((d) => !!(d.imei && d.imei.trim()) || !!(d.serialNumber && d.serialNumber.trim()), {
  message: "Informe IMEI ou numero de serie para identificar o aparelho.",
  path: ["imei"],
});
export type AddSaleUpgradeInput = z.infer<typeof addSaleUpgradeSchema>;

export const removeSaleUpgradeSchema = z.object({
  id: z.string().uuid(),
});
export type RemoveSaleUpgradeInput = z.infer<typeof removeSaleUpgradeSchema>;

// ── Check Pix Status ──

export const checkSalePixStatusSchema = z.object({
  saleId: z.string().uuid(),
  transactionId: z.string().min(1),
  walletTransactionId: z.string().uuid().optional().nullable(),
});
export type CheckSalePixStatusInput = z.infer<typeof checkSalePixStatusSchema>;

// ── Link Customer (post-venda) ──

export const linkSaleCustomerSchema = z.object({
  saleId: z.string().uuid(),
  customerId: z.string().uuid(),
});
export type LinkSaleCustomerInput = z.infer<typeof linkSaleCustomerSchema>;

// ── Update Sale Date (admin) ──

export const updateSaleDateSchema = z.object({
  saleId: z.string().uuid(),
  saleDate: z.string(), // ISO
  reason: z.string().min(1).max(500),
});
export type UpdateSaleDateInput = z.infer<typeof updateSaleDateSchema>;

export const updateSaleSellerSchema = z.object({
  saleId: z.string().uuid(),
  sellerId: z.string().uuid(),
  reason: z.string().min(1, "Informe o motivo da alteracao").max(500),
});
export type UpdateSaleSellerInput = z.infer<typeof updateSaleSellerSchema>;
