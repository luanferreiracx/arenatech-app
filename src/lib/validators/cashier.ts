import { z } from "zod";

// ── Enums ──

export const cashRegisterStatusEnum = z.enum(["OPEN", "CLOSED"]);
export type CashRegisterStatus = z.infer<typeof cashRegisterStatusEnum>;

export const cashMovementTypeEnum = z.enum([
  "OPENING",
  "SALE",
  "SERVICE_ORDER",
  "WITHDRAWAL",
  "DEPOSIT",
  "ADJUSTMENT",
  "EXPENSE",
  "REFUND",
  "CLOSING",
]);
export type CashMovementType = z.infer<typeof cashMovementTypeEnum>;

export const cashMovementNatureEnum = z.enum(["INFLOW", "OUTFLOW"]);
export type CashMovementNature = z.infer<typeof cashMovementNatureEnum>;

export const paymentMethodEnum = z.enum([
  "dinheiro",
  "pix",
  "cartao_credito",
  "cartao_debito",
  "crediario",
  "boleto",
  "transferencia",
  "cheque",
  "outros",
]);

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  dinheiro: "Dinheiro",
  pix: "PIX",
  cartao_credito: "Cartao de Credito",
  cartao_debito: "Cartao de Debito",
  crediario: "Crediario",
  boleto: "Boleto",
  transferencia: "Transferencia",
  cheque: "Cheque",
  outros: "Outros",
};

export const MOVEMENT_TYPE_LABELS: Record<string, string> = {
  OPENING: "Abertura",
  SALE: "Venda",
  SERVICE_ORDER: "Ordem de Servico",
  WITHDRAWAL: "Sangria",
  DEPOSIT: "Suprimento",
  ADJUSTMENT: "Ajuste",
  EXPENSE: "Despesa",
  REFUND: "Estorno",
  CLOSING: "Fechamento",
};

// ── Input Schemas ──

/** Open a cash register */
export const openCashRegisterSchema = z.object({
  /** Opening balance in centavos */
  openingBalance: z.number().int().min(0, "Saldo inicial deve ser >= 0"),
  openingNotes: z.string().max(500).optional(),
});

/** Close a cash register */
export const closeCashRegisterSchema = z.object({
  /** Reported balance in centavos */
  reportedBalance: z.number().int().min(0, "Saldo informado deve ser >= 0"),
  notes: z.string().max(500).optional(),
  /** Per-payment-method verification details */
  closingDetails: z
    .record(
      z.string(),
      z.object({
        systemAmount: z.number().int(),
        reportedAmount: z.number().int(),
        verified: z.boolean(),
        difference: z.number().int(),
      }),
    )
    .optional(),
});

/** Withdrawal (sangria) */
export const withdrawalSchema = z.object({
  /** Amount in centavos */
  amount: z.number().int().min(1, "Valor deve ser maior que zero"),
  description: z.string().min(1, "Motivo e obrigatorio").max(200),
});

/** Deposit (suprimento) */
export const depositSchema = z.object({
  /** Amount in centavos */
  amount: z.number().int().min(1, "Valor deve ser maior que zero"),
  description: z.string().min(1, "Motivo e obrigatorio").max(200),
});

/** History filter */
export const cashRegisterHistorySchema = z.object({
  page: z.number().int().min(0).default(0),
  pageSize: z.number().int().min(1).max(100).default(10),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

/** Review a pending cash register (conferencia) */
export const reviewCashRegisterSchema = z.object({
  /** Cash register ID to review */
  cashRegisterId: z.string().uuid(),
  /** Reported balance in centavos (contagem em dinheiro) */
  reportedBalance: z.number().int().min(0, "Saldo informado deve ser >= 0"),
  /** Optional observation from the reviewer */
  notes: z.string().max(500).optional(),
});
