import { withAdmin } from "@/server/db";
import { logger } from "@/lib/logger";
import { onWithdrawCompleted } from "@/server/services/depix-transaction.service";
import { extractDepixWithdrawReceiptUrl } from "@/lib/depix/receipt-url";
import { recordWebhookEvent, markWebhookProcessed } from "@/lib/webhooks/replay-guard";

/** Payload do webhook de saque da Eulen (docs.eulen.app — WithdrawWebhookBody). */
export interface EulenWithdrawPayload {
  webhookType?: string;
  id?: string;
  status?: string;
  depositAddress?: string;
  depositAmountInCents?: number;
  payoutAmountInCents?: number;
  blockchainTxID?: string;
  receiptUrl?: string;
  centralBankId?: string;
  /** Nome completo do destinatario (titular da chave PIX), validado pela Eulen. */
  receiverName?: string;
  receiverTaxNumber?: string;
  [key: string]: unknown;
}

/**
 * Nome oficial do destinatario vindo da Eulen (`receiverName`), pronto pra
 * mesclar no `data:`. Quando presente, PREVALECE sobre o nome digitado pelo
 * operador (fonte autoritativa). Retorna `{}` se ausente — nunca apaga o nome
 * ja gravado com null/vazio.
 */
function receiverNamePatch(payload: EulenWithdrawPayload): { recipientName?: string } {
  const name = typeof payload.receiverName === "string" ? payload.receiverName.trim() : "";
  return name ? { recipientName: name } : {};
}

/** Status do saque Eulen -> nosso enum. unsent/sending -> PROCESSING; sent ->
 *  COMPLETED; error/refunded -> FAILED; canceled -> CANCELLED. */
function mapEulenWithdrawStatus(
  status: string,
): "PROCESSING" | "COMPLETED" | "FAILED" | "CANCELLED" | null {
  switch (status) {
    case "unsent":
    case "sending":
    case "pending":
    case "processing":
      return "PROCESSING";
    case "sent":
      return "COMPLETED";
    case "error":
    case "refunded":
    case "failed":
      return "FAILED";
    case "canceled":
    case "cancelled":
      return "CANCELLED";
    default:
      return null;
  }
}

/**
 * Processa o webhook de SAQUE da Eulen. Confirma o saque na hora (status `sent`
 * -> COMPLETED), liberando a reserva contabil de saldo (saque preso em
 * PROCESSING reservava saldo ate o cron de reconciliacao rodar).
 */
export async function handleEulenWithdrawWebhook(
  payload: EulenWithdrawPayload,
  sourceIp: string | null,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const withdrawalId = payload.id;
  const statusRaw = (payload.status ?? "").toLowerCase();

  if (!withdrawalId) {
    return { status: 400, body: { error: "missing id" } };
  }

  const mapped = mapEulenWithdrawStatus(statusRaw);
  if (!mapped) {
    return { status: 200, body: { ok: true, skipped: `unmapped status ${statusRaw}` } };
  }

  const receiptUrl =
    (typeof payload.receiptUrl === "string" ? payload.receiptUrl : null) ??
    extractDepixWithdrawReceiptUrl(payload);

  // Idempotencia por (withdrawalId, status).
  const eventKey = `${withdrawalId}:${statusRaw}`;
  const isNew = await recordWebhookEvent({
    provider: "eulen_withdraw",
    eventId: eventKey,
    eventType: statusRaw,
    sourceIp,
    signatureValid: true,
    payload,
  });
  if (!isNew) {
    if (receiptUrl) {
      await withAdmin((tx) =>
        tx.tenantDepixTransaction.updateMany({
          where: { pixpayDepixId: withdrawalId, kind: "WITHDRAW", pixpayReceiptUrl: null },
          data: { pixpayReceiptUrl: receiptUrl, apiResponse: payload as never },
        }),
      );
    }
    logger.info("Eulen-withdraw webhook: evento duplicado", { eventKey });
    return { status: 200, body: { ok: true, duplicate: true } };
  }

  const txRow = await withAdmin((tx) =>
    tx.tenantDepixTransaction.findFirst({
      where: { pixpayDepixId: withdrawalId, kind: "WITHDRAW" },
      select: { id: true, status: true, tenantId: true },
    }),
  );

  if (!txRow) {
    await markWebhookProcessed("eulen_withdraw", eventKey, { ok: false, errorMessage: "not_found" });
    logger.warn("Eulen-withdraw webhook: saque desconhecido", { withdrawalId, statusRaw });
    return { status: 200, body: { ok: true, matched: false } };
  }

  // Ja terminal: so registra o comprovante / nome do destinatario se novos.
  if (["COMPLETED", "FAILED", "CANCELLED", "EXPIRED"].includes(txRow.status)) {
    const namePatch = receiverNamePatch(payload);
    if (receiptUrl || Object.keys(namePatch).length > 0) {
      await withAdmin((tx) =>
        tx.tenantDepixTransaction.update({
          where: { id: txRow.id },
          data: { pixpayReceiptUrl: receiptUrl ?? undefined, apiResponse: payload as never, ...namePatch },
        }),
      );
    }
    await markWebhookProcessed("eulen_withdraw", eventKey, { ok: true });
    return { status: 200, body: { ok: true, matched: true, skipped: "already_terminal" } };
  }

  const isTerminal = ["COMPLETED", "FAILED", "CANCELLED"].includes(mapped);
  await withAdmin((tx) =>
    tx.tenantDepixTransaction.update({
      where: { id: txRow.id },
      data: {
        status: mapped,
        completedAt: isTerminal ? new Date() : undefined,
        pixpayReceiptUrl: receiptUrl ?? undefined,
        apiResponse: payload as never,
        errorMessage: mapped === "FAILED" ? `Eulen saque ${statusRaw}` : undefined,
        ...receiverNamePatch(payload),
      },
    }),
  );

  if (mapped === "COMPLETED") {
    void onWithdrawCompleted(txRow.tenantId, txRow.id);
  }

  await markWebhookProcessed("eulen_withdraw", eventKey, { ok: true });
  logger.info("Eulen-withdraw webhook processado", {
    withdrawalId,
    statusRaw,
    mapped,
    id: txRow.id,
  });
  return { status: 200, body: { ok: true, matched: true, status: mapped } };
}
