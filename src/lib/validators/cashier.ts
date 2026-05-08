import { z } from "zod";

// ────────────────────────────────────────────────────────────────────────────
// CashRegister — open
// ────────────────────────────────────────────────────────────────────────────

export const openCashRegisterSchema = z.object({
  openingBalance: z.number().min(0, "Saldo inicial não pode ser negativo"),
});

export type OpenCashRegisterInput = z.infer<typeof openCashRegisterSchema>;

// ────────────────────────────────────────────────────────────────────────────
// CashRegister — close
// ────────────────────────────────────────────────────────────────────────────

export const closeCashRegisterSchema = z.object({
  closingBalance: z.number().min(0, "Saldo de fechamento não pode ser negativo"),
  notes: z.string().optional(),
});

export type CloseCashRegisterInput = z.infer<typeof closeCashRegisterSchema>;

// ────────────────────────────────────────────────────────────────────────────
// CashMovement
// ────────────────────────────────────────────────────────────────────────────

export const addCashMovementSchema = z.object({
  type: z.enum(["WITHDRAWAL", "DEPOSIT"]),
  amount: z.number().min(0.01, "Valor deve ser maior que zero"),
  paymentMethod: z.string().optional(),
  description: z.string().min(1, "Descrição obrigatória"),
});

export type AddCashMovementInput = z.infer<typeof addCashMovementSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Cash history list
// ────────────────────────────────────────────────────────────────────────────

export const listCashHistorySchema = z.object({
  from: z.date().optional(),
  to: z.date().optional(),
  page: z.number().int().min(0),
  pageSize: z.number().int().min(1).max(100),
});

export type ListCashHistoryInput = z.infer<typeof listCashHistorySchema>;
