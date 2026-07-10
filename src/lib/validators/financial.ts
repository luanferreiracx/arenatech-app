import { z } from "zod";

// A4 (auditoria fin 2026-07-10): teto sanitário para valores em centavos. R$ 1M
// está acima de qualquer lançamento real e abaixo do limite de precisão de
// Number — fecha overflow/envenenamento de agregados (DRE/fluxo) por input
// adulterado. Mesmo padrão do A2 do PDV.
const MAX_CENTS = 100_000_000; // R$ 1.000.000,00

// ── Enums ──

export const transactionTypeEnum = z.enum(["PAYABLE", "RECEIVABLE"]);
export type TransactionType = z.infer<typeof transactionTypeEnum>;

export const transactionStatusEnum = z.enum([
  "PENDING",
  "PAID",
  "OVERDUE",
  "CANCELLED",
  "PARTIALLY_PAID",
]);
export type TransactionStatus = z.infer<typeof transactionStatusEnum>;

export const TRANSACTION_TYPE_LABELS: Record<string, string> = {
  PAYABLE: "A Pagar",
  RECEIVABLE: "A Receber",
};

export const TRANSACTION_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendente",
  PAID: "Paga",
  OVERDUE: "Vencida",
  CANCELLED: "Cancelada",
  PARTIALLY_PAID: "Parcialmente Paga",
};

export const INSTALLMENT_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendente",
  PAID: "Paga",
  OVERDUE: "Vencida",
  CANCELLED: "Cancelada",
};

// ── Create Transaction ──

export const createTransactionSchema = z.object({
  type: transactionTypeEnum,
  description: z.string().min(1, "Descricao e obrigatoria").max(200),
  category: z.string().max(100).optional().nullable(),
  /** For PAYABLE */
  supplier: z.string().max(200).optional().nullable(),
  /** For RECEIVABLE */
  customerName: z.string().max(200).optional().nullable(),
  customerId: z.string().uuid().optional().nullable(),
  /** Total amount in centavos */
  totalAmount: z.number().int().min(1, "Valor deve ser maior que zero").max(MAX_CENTS, "Valor acima do limite permitido"),
  /** Payment method */
  paymentMethod: z.string().max(50).optional().nullable(),
  /** Number of installments (1-60) */
  numInstallments: z.number().int().min(1).max(60),
  /** Emission date (ISO string) */
  emissionDate: z.string().min(1, "Data de emissao e obrigatoria"),
  /** First due date (ISO string) - defaults to 30 days after emission */
  firstDueDate: z.string().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;

// ── Update Transaction ──

export const updateTransactionSchema = z.object({
  id: z.string().uuid(),
  description: z.string().min(1, "Descricao e obrigatoria").max(200),
  category: z.string().max(100).optional().nullable(),
  supplier: z.string().max(200).optional().nullable(),
  customerName: z.string().max(200).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export type UpdateTransactionInput = z.infer<typeof updateTransactionSchema>;

// ── List Transactions ──

export const listTransactionsSchema = z.object({
  type: transactionTypeEnum,
  status: transactionStatusEnum.optional(),
  search: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  page: z.number().int().min(0).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
  sortBy: z.enum(["createdAt", "dueDate", "totalAmount", "description"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
});

export type ListTransactionsInput = z.infer<typeof listTransactionsSchema>;

// ── Pay Installment ──

export const payInstallmentSchema = z.object({
  installmentId: z.string().uuid(),
  /** Amount paid in centavos */
  amountPaid: z.number().int().min(1, "Valor pago deve ser maior que zero").max(MAX_CENTS, "Valor acima do limite permitido"),
  paymentMethod: z.string().max(50).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});

export type PayInstallmentInput = z.infer<typeof payInstallmentSchema>;

// ── Reverse Installment ──

export const reverseInstallmentSchema = z.object({
  installmentId: z.string().uuid(),
  reason: z.string().min(3, "Motivo deve ter no minimo 3 caracteres").max(500),
  // Estorno parcial: valor em centavos a ser estornado. Se omitido, estorna o total pago.
  amount: z.number().int().min(1).max(MAX_CENTS).optional(),
});

export type ReverseInstallmentInput = z.infer<typeof reverseInstallmentSchema>;

// ── Cash Flow ──

export const cashFlowSchema = z.object({
  dateFrom: z.string().min(1, "Data inicial e obrigatoria"),
  dateTo: z.string().min(1, "Data final e obrigatoria"),
  groupBy: z.enum(["day", "week", "month"]).optional(),
});

export type CashFlowInput = z.infer<typeof cashFlowSchema>;

// ── Overdue ──

export const overdueSchema = z.object({
  type: transactionTypeEnum.optional(),
  page: z.number().int().min(0).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
});

export type OverdueInput = z.infer<typeof overdueSchema>;

// ── DRE (Demonstrativo de Resultados) ──

export const dreSchema = z.object({
  year: z.number().int().min(2020).max(2050),
});

export type DreInput = z.infer<typeof dreSchema>;

// ── Projected Cash Flow ──

export const projectedCashFlowSchema = z.object({
  days: z.number().int().min(7).max(90),
});

export type ProjectedCashFlowInput = z.infer<typeof projectedCashFlowSchema>;

// ── Receivables (dedicated view) ──

export const listReceivablesSchema = z.object({
  search: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  paymentMethod: z.string().optional(),
  page: z.number().int().min(0).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
});

export type ListReceivablesInput = z.infer<typeof listReceivablesSchema>;

// ── Pending payments ──

export const listPendingSchema = z.object({
  status: z.string().optional(),
  search: z.string().optional(),
  page: z.number().int().min(0).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
});

export type ListPendingInput = z.infer<typeof listPendingSchema>;
