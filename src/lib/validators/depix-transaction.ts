import { z } from "zod";
import { DEPIX_LIMITS } from "@/lib/services/depix-transaction-fee";

/** Status labels pra UI. */
export const DEPIX_TX_STATUS_LABELS: Record<string, string> = {
  PENDING: "Aguardando pagamento",
  PROCESSING: "Processando",
  PROCESSING_FEE: "Concluindo (taxa)",
  COMPLETED: "Concluido",
  COMPLETED_FEE_PENDING: "Concluido (taxa pendente)",
  FAILED: "Falhou",
  CANCELLED: "Cancelado",
  EXPIRED: "Expirado",
};

export const DEPIX_TX_KIND_LABELS: Record<string, string> = {
  DEPOSIT: "Deposito",
  WITHDRAW: "Saque",
};

const VALID_PIX_KEY_TYPES = ["RANDOM", "CPF", "CNPJ", "EMAIL", "PHONE"] as const;

/** Cria deposito: tenant escolhe quanto quer receber via PIX.
 *  Min R$ 10 (abaixo, as taxas devoram), Max R$ 5.000 (limite PixPay). */
export const createDepositSchema = z.object({
  grossAmountCents: z
    .number()
    .int()
    .min(DEPIX_LIMITS.MIN_CENTS, "Valor minimo R$ 10,00")
    .max(DEPIX_LIMITS.MAX_CENTS, "Valor maximo R$ 5.000,00"),
});
export type CreateDepositInput = z.infer<typeof createDepositSchema>;

/** Valida CPF/CNPJ — paridade Laravel. Aceita so digitos ou formatado. */
function isValidTaxId(taxId: string): boolean {
  const digits = taxId.replace(/\D/g, "");
  return digits.length === 11 || digits.length === 14;
}

export const createWithdrawSchema = z.object({
  pixKeyType: z.enum(VALID_PIX_KEY_TYPES),
  pixKey: z.string().min(1).max(255),
  recipientName: z.string().max(200).optional().nullable(),
  recipientTaxId: z
    .string()
    .min(11)
    .max(18)
    .refine(isValidTaxId, "CPF/CNPJ invalido"),
  /**
   * Valor LIQUIDO em centavos — o quanto o destinatario deve receber via PIX.
   * O sistema calcula automaticamente o bruto (gross) a debitar do saldo,
   * adicionando taxa Arena Tech + taxa PixPay (estimada).
   * Min R$ 10 (abaixo, as taxas devoram), Max R$ 5.000 (limite PixPay).
   */
  netAmountCents: z
    .number()
    .int()
    .min(DEPIX_LIMITS.MIN_CENTS, "Valor minimo R$ 10,00")
    .max(DEPIX_LIMITS.MAX_CENTS, "Valor maximo R$ 5.000,00"),
  /** Cliente-side UUID pra idempotencia em retry. */
  idempotencyKey: z.string().uuid().optional(),
});
export type CreateWithdrawInput = z.infer<typeof createWithdrawSchema>;

export const listTransactionsSchema = z.object({
  kind: z.enum(["DEPOSIT", "WITHDRAW", "ALL"]).optional(),
  status: z
    .enum([
      "PENDING",
      "PROCESSING",
      "PROCESSING_FEE",
      "COMPLETED",
      "COMPLETED_FEE_PENDING",
      "FAILED",
      "CANCELLED",
      "EXPIRED",
      "ALL",
    ])
    .optional(),
  page: z.number().int().min(0).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});
export type ListTransactionsInput = z.infer<typeof listTransactionsSchema>;

export const cancelTransactionSchema = z.object({
  id: z.string().uuid(),
  reason: z.string().max(500).optional(),
});
