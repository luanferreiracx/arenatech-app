import { z } from "zod";

// ────────────────────────────────────────────────────────────────────────────
// CashRegister — open
// ────────────────────────────────────────────────────────────────────────────

export const openCashRegisterSchema = z.object({
  openingBalance: z.number().min(0, "Saldo inicial não pode ser negativo"),
  openingNotes: z.string().max(500).optional(),
});

export type OpenCashRegisterInput = z.infer<typeof openCashRegisterSchema>;

// ────────────────────────────────────────────────────────────────────────────
// CashRegister — close (with per-payment-method conferencia)
// ────────────────────────────────────────────────────────────────────────────

export const closingDetailSchema = z.object({
  system: z.number(),
  reported: z.number(),
  verified: z.boolean(),
  difference: z.number(),
});

export type ClosingDetail = z.infer<typeof closingDetailSchema>;

export const closeCashRegisterSchema = z.object({
  closingBalance: z.number().min(0, "Saldo de fechamento não pode ser negativo"),
  notes: z.string().max(500).optional(),
  closingDetails: z.record(z.string(), closingDetailSchema).optional(),
});

export type CloseCashRegisterInput = z.infer<typeof closeCashRegisterSchema>;

// ────────────────────────────────────────────────────────────────────────────
// CashMovement
// ────────────────────────────────────────────────────────────────────────────

export const addCashMovementSchema = z.object({
  type: z.enum(["WITHDRAWAL", "DEPOSIT"]),
  amount: z.number().min(0.01, "Valor deve ser maior que zero"),
  paymentMethod: z.string().optional(),
  description: z.string().min(1, "Descrição/motivo obrigatório"),
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

// ────────────────────────────────────────────────────────────────────────────
// Movement type labels/colors (shared between server and client)
// ────────────────────────────────────────────────────────────────────────────

export const movementTypeLabels: Record<string, string> = {
  OPENING: "Abertura",
  SALE: "Venda",
  SERVICE_ORDER: "Ordem de Serviço",
  WITHDRAWAL: "Sangria",
  DEPOSIT: "Suprimento",
  EXPENSE: "Despesa",
  REFUND: "Estorno",
  ADJUSTMENT: "Ajuste",
  CLOSING: "Fechamento",
};

export const movementNatureLabels: Record<string, string> = {
  INFLOW: "Entrada",
  OUTFLOW: "Saída",
};

export const paymentMethodLabels: Record<string, string> = {
  dinheiro: "Dinheiro",
  pix: "PIX",
  cartao_credito: "Cartão de Crédito",
  cartao_debito: "Cartão de Débito",
  crediario: "Crediário",
  boleto: "Boleto",
  transferencia: "Transferência",
  cheque: "Cheque",
  depix: "DEPIX",
  outros: "Outros",
};
