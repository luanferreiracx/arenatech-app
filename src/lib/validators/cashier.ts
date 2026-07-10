import { z } from "zod";

// A4 (auditoria fin 2026-07-10): teto sanitário em centavos (R$ 1M) — fecha
// overflow de saldo/gaveta por input adulterado. Mesmo padrão do PDV/financeiro.
const MAX_CENTS = 100_000_000;

// ── Enums ──

export const cashMovementTypeEnum = z.enum(["SALE", "DEPOSIT", "WITHDRAWAL", "EXPENSE"]);
export type CashMovementType = z.infer<typeof cashMovementTypeEnum>;

export const cashMovementNatureEnum = z.enum(["INCOME", "OUTCOME"]);
export type CashMovementNature = z.infer<typeof cashMovementNatureEnum>;

export const paymentMethodEnum = z.enum([
  "dinheiro",
  "pix",
  "depix",
  "cartao_credito",
  "cartao_debito",
  "crediario",
  "boleto",
  "transferencia",
  "cheque",
  "outros",
]);
export type PaymentMethod = z.infer<typeof paymentMethodEnum>;

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  dinheiro: "Dinheiro",
  pix: "PIX",
  depix: "DePix",
  cartao_credito: "Cartao de Credito",
  cartao_debito: "Cartao de Debito",
  crediario: "Crediario",
  boleto: "Boleto",
  transferencia: "Transferencia",
  cheque: "Cheque",
  outros: "Outros",
};

export const MOVEMENT_TYPE_LABELS: Record<string, string> = {
  SALE: "Venda",
  WITHDRAWAL: "Sangria",
  DEPOSIT: "Suprimento",
  EXPENSE: "Despesa",
};

// ── Input Schemas ──

/** Open a cash session */
export const openCashSessionSchema = z.object({
  /** Opening balance in centavos */
  initialBalance: z.number().int().min(0, "Saldo inicial deve ser >= 0").max(MAX_CENTS, "Valor acima do limite"),
  openingNote: z.string().max(500).optional(),
});

/** Close a cash session */
export const closeCashSessionSchema = z.object({
  /** Declared balance in centavos (reported by operator) */
  declaredBalance: z.number().int().min(0, "Saldo informado deve ser >= 0").max(MAX_CENTS, "Valor acima do limite"),
  closingNote: z.string().max(500).optional(),
  /**
   * Conferencia das formas nao-dinheiro. Para cada metodo (ex.: "pix",
   * "cartao_debito"): se `verified=true`, operador confirmou que valor
   * confere; senao, `reportedAmount` traz o valor real conferido em
   * centavos. Persistido no closingNote como bloco JSON para audit.
   */
  methodVerifications: z
    .array(
      z.object({
        method: z.string().min(1).max(50),
        verified: z.boolean(),
        reportedAmount: z.number().int().min(0).optional(),
        expectedAmount: z.number().int().min(0).optional(),
      }),
    )
    .max(20)
    .optional(),
});

/** Withdrawal (sangria) */
export const withdrawalSchema = z.object({
  /** Amount in centavos */
  amount: z.number().int().min(1, "Valor deve ser maior que zero").max(MAX_CENTS, "Valor acima do limite"),
  description: z.string().min(1, "Motivo e obrigatorio").max(200),
});

/** Deposit (suprimento) */
export const depositSchema = z.object({
  /** Amount in centavos */
  amount: z.number().int().min(1, "Valor deve ser maior que zero").max(MAX_CENTS, "Valor acima do limite"),
  description: z.string().min(1, "Motivo e obrigatorio").max(200),
});

/** History filter */
export const cashSessionHistorySchema = z.object({
  page: z.number().int().min(0).default(0),
  pageSize: z.number().int().min(1).max(100).default(10),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

/** Review a pending cash session (conferencia) */
export const reviewCashSessionSchema = z.object({
  /** Cash session ID to review */
  cashSessionId: z.string().uuid(),
  /** Reported balance in centavos (contagem em dinheiro) */
  reportedBalance: z.number().int().min(0, "Saldo informado deve ser >= 0").max(MAX_CENTS, "Valor acima do limite"),
  /** Optional observation from the reviewer */
  notes: z.string().max(500).optional(),
});

// ── Keep old export names as aliases for backward compat at import sites ──
/** @deprecated Use openCashSessionSchema */
export const openCashRegisterSchema = openCashSessionSchema;
/** @deprecated Use closeCashSessionSchema */
export const closeCashRegisterSchema = closeCashSessionSchema;
/** @deprecated Use cashSessionHistorySchema */
export const cashRegisterHistorySchema = cashSessionHistorySchema;
/** @deprecated Use reviewCashSessionSchema */
export const reviewCashRegisterSchema = reviewCashSessionSchema;
