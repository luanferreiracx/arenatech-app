/**
 * Schemas Zod do contrato da API de parceiros (ADR 0057) — FONTE ÚNICA usada tanto
 * em runtime (validação/tipos) quanto pra gerar o OpenAPI (`openapi-spec.ts`). Os
 * DTOs de resposta saem daqui via `z.infer`, então a doc nunca diverge do código.
 *
 * Requests vivem em `write-schemas.ts` (reexportados abaixo).
 */
import { z } from "zod";

// ── Respostas ────────────────────────────────────────────────────────────────

export const partnerTransactionResponseSchema = z
  .object({
    id: z.string(),
    number: z.string().describe("Número único da transação no tenant (ex.: TXD20260630-00001)."),
    kind: z.enum(["DEPOSIT", "WITHDRAW"]),
    status: z
      .string()
      .describe(
        "PENDING | PROCESSING | COMPLETED | FAILED | CANCELLED | EXPIRED | MED_REFUNDED. " +
          "IMPORTANTE (depósito): PROCESSING = PIX RECEBIDO (pagamento confirmado); use isto " +
          "para confirmar o pagamento. COMPLETED = DePix liquidado on-chain, que pode levar até " +
          "~24h por retenção do provedor (Eulen). Não espere COMPLETED para confirmar o pagamento.",
      ),
    sourceType: z.string(),
    grossAmountCents: z.number().int().describe("Valor bruto em centavos."),
    netAmountCents: z.number().int().nullable().describe("Líquido (após taxas), em centavos."),
    feeArenaTechCents: z.number().int().describe("Taxa Arena retida, em centavos."),
    payerName: z.string().nullable().describe("Pagador (depósito), quando disponível."),
    recipientName: z.string().nullable().describe("Destinatário (saque), quando disponível."),
    onchainTxId: z.string().nullable().describe("txid Liquid (depósito ou saque), quando houver."),
    onchainAddress: z.string().nullable().describe("Endereço Liquid de destino (saque on-chain)."),
    createdAt: z.string().describe("ISO 8601."),
    completedAt: z.string().nullable().describe("ISO 8601."),
  })
  .meta({ id: "PartnerTransaction" });

export const partnerDepositResultSchema = z
  .object({
    id: z.string(),
    number: z.string(),
    status: z.string(),
    amountCents: z.number().int(),
    qrCode: z.string().nullable().describe("PIX copia-e-cola."),
    qrCodeBase64: z.string().nullable().describe("Imagem do QR (data URL)."),
  })
  .meta({ id: "PartnerDepositResult" });

export const partnerWithdrawResultSchema = z
  .object({
    id: z.string(),
    number: z.string(),
    status: z.string(),
    // Só PIX na API de parceiros; on-chain não é exposto (ver write-schemas).
    method: z.literal("pix"),
    amountCents: z.number().int(),
    onchainTxId: z.string().nullable().describe("txid Liquid da liquidação, quando houver."),
  })
  .meta({ id: "PartnerWithdrawResult" });

export const partnerErrorResponseSchema = z
  .object({
    error: z.string().describe("Código do erro (ex.: invalid_key, insufficient_scope)."),
    message: z.string(),
  })
  .meta({ id: "PartnerError" });

/** Evento de webhook de saída (corpo do POST que enviamos ao parceiro).
 *  - deposit.pix_received: PIX recebido (pagamento confirmado). Dispara sem esperar o
 *    DePix on-chain — use para confirmar o pagamento (com o delay da Eulen, o
 *    deposit.completed pode levar ~24h).
 *  - deposit.completed: DePix liquidado on-chain.
 *  - withdrawal.completed: saque PIX concluído. */
export const partnerWebhookEventSchema = z
  .object({
    type: z.enum(["deposit.pix_received", "deposit.completed", "withdrawal.completed"]),
    transactionId: z.string(),
    number: z.string(),
    status: z.string(),
    amountCents: z.number().int(),
    occurredAt: z.string().describe("ISO 8601."),
  })
  .meta({ id: "PartnerWebhookEvent" });

// ── Tipos derivados (não duplicar à mão) ─────────────────────────────────────

export type PartnerTransactionDTO = z.infer<typeof partnerTransactionResponseSchema>;
export type PartnerDepositResult = z.infer<typeof partnerDepositResultSchema>;
export type PartnerWithdrawResult = z.infer<typeof partnerWithdrawResultSchema>;
export type PartnerWebhookEvent = z.infer<typeof partnerWebhookEventSchema>;
