import { withAdmin } from "@/server/db";
import { logger } from "@/lib/logger";
import { onWithdrawCompleted } from "@/server/services/depix-transaction.service";
import { extractDepixWithdrawReceiptUrl } from "@/lib/depix/receipt-url";
import {
  recordWebhookEvent,
  markWebhookProcessed,
} from "@/lib/webhooks/replay-guard";

export type PixpayWithdrawPayload = {
  id?: string;
  status?: string;
  blockchain_tx_id?: string;
  received_amount?: number;
  fee?: number;
  // Campos opcionais — Pixpay envia receipt_url em alguns eventos
  receipt_url?: string;
};

/**
 * Mapeia status do Pixpay para o enum DepixWithdrawStatus.
 * Inclui "sending" (visto em prod no Laravel — paridade DepixService.php).
 */
function mapPixpayStatus(
  status: string,
): "PROCESSING" | "SENT" | "FAILED" | "CANCELLED" | null {
  switch (status) {
    case "unsent":
    case "processing":
    case "pending":
    case "sending": // Pixpay usa "sending" durante envio — paridade Laravel
      return "PROCESSING";
    case "completed":
    case "sent":
    case "paid":
      return "SENT";
    case "failed":
    case "error":
    case "rejected":
      return "FAILED";
    case "cancelled":
    case "canceled":
      return "CANCELLED";
    default:
      return null;
  }
}

function mapWalletStatus(
  status: string,
): "PROCESSING" | "COMPLETED" | "FAILED" | "CANCELLED" | null {
  switch (status) {
    case "unsent":
    case "processing":
    case "pending":
    case "sending":
      return "PROCESSING";
    case "completed":
    case "sent":
    case "paid":
      return "COMPLETED";
    case "failed":
    case "error":
    case "rejected":
      return "FAILED";
    case "cancelled":
    case "canceled":
      return "CANCELLED";
    default:
      return null;
  }
}

/**
 * Processa webhook de saque DePix. Compartilhado entre `/api/webhooks/depix`
 * (unificado, paridade Laravel) e `/api/webhooks/depix-withdraw` (legado).
 *
 * Retorna a resposta JSON a ser enviada pro Pixpay.
 */
export async function handleDepixWithdrawWebhook(
  payload: PixpayWithdrawPayload,
  sourceIp: string | null,
  signatureValid: boolean,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const depixId = payload.id;
  const statusRaw = (payload.status ?? "").toLowerCase();

  if (!depixId) {
    return { status: 400, body: { error: "Missing id" } };
  }

  const mappedStatus = mapPixpayStatus(statusRaw);
  if (!mappedStatus) {
    return { status: 200, body: { ok: true, skipped: `unmapped status ${statusRaw}` } };
  }
  const receiptUrl = extractDepixWithdrawReceiptUrl(payload);

  const eventKey = `${depixId}:${statusRaw}`;
  const isNewEvent = await recordWebhookEvent({
    provider: "depix_withdraw",
    eventId: eventKey,
    eventType: statusRaw,
    sourceIp,
    signatureValid,
    payload,
  });
  if (!isNewEvent) {
    if (receiptUrl) {
      await withAdmin((tx) =>
        tx.tenantDepixTransaction.updateMany({
          where: { pixpayDepixId: depixId, kind: "WITHDRAW", pixpayReceiptUrl: null },
          data: { pixpayReceiptUrl: receiptUrl, apiResponse: payload as never },
        }),
      );
    }
    logger.info("Depix-withdraw webhook: evento duplicado", { eventKey, hasReceiptUrl: !!receiptUrl });
    return { status: 200, body: { ok: true, duplicate: true } };
  }

  logger.info("Depix-withdraw webhook", { depixId, statusRaw, mappedStatus, hasReceiptUrl: !!receiptUrl });

  const walletStatus = mapWalletStatus(statusRaw);
  if (walletStatus) {
    const walletResult = await withAdmin((tx) =>
      tx.tenantDepixTransaction.findFirst({
        where: { pixpayDepixId: depixId, kind: "WITHDRAW" },
        select: { id: true, status: true, tenantId: true },
      }),
    );

    if (walletResult) {
      if (["COMPLETED", "FAILED", "CANCELLED", "EXPIRED"].includes(walletResult.status)) {
        if (receiptUrl) {
          await withAdmin((tx) =>
            tx.tenantDepixTransaction.update({
              where: { id: walletResult.id },
              data: { pixpayReceiptUrl: receiptUrl, apiResponse: payload as never },
            }),
          );
        }
        logger.info("Depix-withdraw webhook: wallet tx ja terminal, skipping", {
          id: walletResult.id,
          currentStatus: walletResult.status,
          incomingStatus: walletStatus,
          hasReceiptUrl: !!receiptUrl,
        });
        await markWebhookProcessed("depix_withdraw", eventKey, { ok: true });
        return { status: 200, body: { ok: true, matched: true, wallet: true, skipped: true } };
      }

      await withAdmin((tx) =>
        tx.tenantDepixTransaction.update({
          where: { id: walletResult.id },
          data: {
            status: walletStatus,
            completedAt: ["COMPLETED", "FAILED", "CANCELLED"].includes(walletStatus) ? new Date() : undefined,
            pixpayReceiptUrl: receiptUrl ?? undefined,
            apiResponse: payload as never,
            errorMessage: walletStatus === "FAILED" ? `PixPay saque falhou: ${statusRaw}` : undefined,
          },
        }),
      );

      if (walletStatus === "COMPLETED") {
        void onWithdrawCompleted(walletResult.tenantId, walletResult.id);
      }

      await markWebhookProcessed("depix_withdraw", eventKey, { ok: true });
      return { status: 200, body: { ok: true, matched: true, wallet: true, id: walletResult.id } };
    }
  }

  // Webhook sem cookie de tenant: casa por depixId (global, unico). Cross-tenant
  // legitimo -> withAdmin (BYPASSRLS). Com o runtime como app_login (sujeito a
  // RLS), `prisma` direto em depix_withdrawals retornaria 0.
  const result = await withAdmin((tx) =>
    tx.depixWithdraw.findFirst({
      where: { depixId },
      select: { id: true, status: true, tenantId: true },
    }),
  );

  if (!result) {
    logger.warn("Depix-withdraw webhook: record not found", { depixId });
    return { status: 200, body: { ok: true, matched: false } };
  }

  // Idempotencia: estados terminais nao reprocessam
  if (
    ["SENT", "FAILED", "CANCELLED"].includes(result.status) &&
    mappedStatus !== result.status
  ) {
    logger.info("Depix-withdraw webhook: state already terminal, skipping", {
      id: result.id,
      currentStatus: result.status,
      incomingStatus: mappedStatus,
    });
    return { status: 200, body: { ok: true, matched: true, skipped: true } };
  }

  await withAdmin((tx) =>
    tx.depixWithdraw.update({
      where: { id: result.id },
      data: {
        status: mappedStatus,
        blockchainTxId: payload.blockchain_tx_id ?? undefined,
        receivedAmount: payload.received_amount ?? undefined,
        fee: payload.fee ?? undefined,
        apiResponse: payload as never,
      },
    }),
  );

  await markWebhookProcessed("depix_withdraw", eventKey, { ok: true });
  return { status: 200, body: { ok: true, matched: true, id: result.id } };
}
