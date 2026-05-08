import { z } from "zod";

// ────────────────────────────────────────────────────────────────────────────
// FinancialTransaction
// ────────────────────────────────────────────────────────────────────────────

export const createTransactionSchema = z.object({
  type: z.enum(["PAYABLE", "RECEIVABLE"]),
  description: z.string().min(1, "Descrição obrigatória").max(500),
  category: z.string().max(100).optional(),
  totalAmount: z.number().min(0.01, "Valor total deve ser maior que zero"),
  dueDate: z.date({ error: "Data de vencimento obrigatória" }),
  customerId: z.string().uuid().optional(),
  referenceId: z.string().uuid().optional(),
  referenceType: z.string().max(50).optional(),
  notes: z.string().optional(),
  installments: z.number().int().min(1).max(36),
});

export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;

export const updateTransactionSchema = z.object({
  description: z.string().min(1).max(500).optional(),
  category: z.string().max(100).optional(),
  dueDate: z.date().optional(),
  customerId: z.string().uuid().optional().nullable(),
  notes: z.string().optional(),
});

export type UpdateTransactionInput = z.infer<typeof updateTransactionSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Transaction list filters
// ────────────────────────────────────────────────────────────────────────────

export const listTransactionsSchema = z.object({
  type: z.enum(["PAYABLE", "RECEIVABLE"]).optional(),
  status: z.enum(["PENDING", "PAID", "OVERDUE", "CANCELLED", "PARTIALLY_PAID"]).optional(),
  from: z.date().optional(),
  to: z.date().optional(),
  search: z.string().optional(),
  page: z.number().int().min(0),
  pageSize: z.number().int().min(1).max(100),
});

export type ListTransactionsInput = z.infer<typeof listTransactionsSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Pay installment
// ────────────────────────────────────────────────────────────────────────────

export const payInstallmentSchema = z.object({
  installmentId: z.string().uuid(),
  paidAmount: z.number().min(0.01, "Valor pago deve ser maior que zero"),
  paidAt: z.date().optional(),
});

export type PayInstallmentInput = z.infer<typeof payInstallmentSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Cash flow report
// ────────────────────────────────────────────────────────────────────────────

export const cashFlowReportSchema = z.object({
  from: z.date(),
  to: z.date(),
  groupBy: z.enum(["day", "week", "month"]),
});

export type CashFlowReportInput = z.infer<typeof cashFlowReportSchema>;
