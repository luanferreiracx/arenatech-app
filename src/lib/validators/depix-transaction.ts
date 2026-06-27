import { z } from "zod";
import { DEPIX_LIMITS } from "@/lib/services/depix-transaction-fee";
import { isValidTaxId as isValidTaxIdMod11 } from "@/lib/utils/tax-id";

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
  MED_REFUNDED: "Devolvido (MED)",
};

export const DEPIX_TX_KIND_LABELS: Record<string, string> = {
  DEPOSIT: "Deposito",
  WITHDRAW: "Saque",
};

const VALID_PIX_KEY_TYPES = ["RANDOM", "CPF", "CNPJ", "EMAIL", "PHONE"] as const;
const VALID_SOURCE_TYPES = ["WALLET", "QUICK_SALE", "SALE", "SERVICE_ORDER"] as const;
const TAX_ID_REQUIRED_FROM_CENTS = 50_000;

export const depixTransactionSourceTypeSchema = z.enum(VALID_SOURCE_TYPES);

function hasText(value: string | null | undefined): boolean {
  return (value ?? "").trim().length > 0;
}

function hasValidPhone(value: string | null | undefined): boolean {
  if (!hasText(value)) return true;
  const digits = (value ?? "").replace(/\D/g, "");
  const hasBrazilianLocalNumber = digits.length === 10 || digits.length === 11;
  const hasBrazilianCountryCode =
    (digits.length === 12 || digits.length === 13) && digits.startsWith("55");
  return hasBrazilianLocalNumber || hasBrazilianCountryCode;
}

/** Cria deposito: tenant escolhe quanto quer receber via PIX.
 *  Min R$ 10 (abaixo, as taxas devoram), Max R$ 5.000 (limite operacional). */
export const createDepositSchema = z
  .object({
    grossAmountCents: z
      .number()
      .int()
      .min(DEPIX_LIMITS.MIN_CENTS, "Valor minimo R$ 10,00")
      .max(DEPIX_LIMITS.MAX_CENTS, "Valor maximo R$ 5.000,00"),
    payerTaxId: z.string().max(18).optional().nullable(),
    payerPhone: z.string().max(20).optional().nullable(),
    sourceType: depixTransactionSourceTypeSchema.optional(),
    sourceId: z.string().uuid().optional().nullable(),
    sourceDescription: z.string().max(200).optional().nullable(),
  })
  .superRefine((input, ctx) => {
    const payerTaxId = input.payerTaxId?.trim() ?? "";
    const requiresTaxId = input.grossAmountCents >= TAX_ID_REQUIRED_FROM_CENTS;
    if (requiresTaxId && !payerTaxId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["payerTaxId"],
        message: "CPF/CNPJ obrigatorio para recebimentos a partir de R$ 500,00",
      });
      return;
    }
    if (payerTaxId && !isValidTaxIdMod11(payerTaxId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["payerTaxId"],
        message: "CPF/CNPJ invalido",
      });
    }
    if (!hasValidPhone(input.payerPhone)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["payerPhone"],
        message: "Telefone invalido",
      });
    }
  });
export type CreateDepositInput = z.infer<typeof createDepositSchema>;

export const createWithdrawSchema = z.object({
  pixKeyType: z.enum(VALID_PIX_KEY_TYPES),
  pixKey: z.string().min(1).max(255),
  recipientName: z.string().max(200).optional().nullable(),
  // Validacao mod-11 (DV de CPF/CNPJ) — rejeita 11111... e digitos errados.
  // Mais rigorosa que so checar comprimento.
  recipientTaxId: z
    .string()
    .min(11)
    .max(18)
    .refine(isValidTaxIdMod11, "CPF/CNPJ invalido"),
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
  /**
   * Codigo 2FA (TOTP de 6 digitos OU backup code) — saque move dinheiro
   * on-chain irreversivel, entao exige re-confirmacao de identidade do admin
   * alem da sessao. Aceita ambos os formatos; a verificacao distingue.
   */
  twoFactorCode: z.string().trim().min(1, "Informe o codigo 2FA").max(20),
  /**
   * Passphrase da carteira (ADR 0051) — obrigatoria quando a carteira do tenant
   * e non-custodial (o LWK assina decifrando a seed). Opcional aqui (o service
   * valida conforme custodyModel); NUNCA logada. Sem .trim() — espacos podem
   * ser intencionais na passphrase.
   */
  walletPassphrase: z.string().min(1).max(256).optional(),
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
