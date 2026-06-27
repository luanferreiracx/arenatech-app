import { withAdmin } from "@/server/db";
import { logger } from "@/lib/logger";
import { recordWebhookEvent, markWebhookProcessed } from "@/lib/webhooks/replay-guard";
import { verifyDepositOnChain } from "@/lib/webhooks/lwk-deposit-handler";
import { propagateDepositNotPaid } from "@/lib/webhooks/depix-deposit-propagate";
import {
  settleDepositConfirmed,
  settleDepositViaFeeWallet,
  applyPixReceivedEffects,
} from "@/server/services/depix-transaction.service";
import { getFeeWalletTenantId } from "@/server/services/depix-fee-wallet.service";

/** Payload do webhook de deposito da Eulen (docs.eulen.app — DepositWebhookBody). */
export interface EulenDepositPayload {
  webhookType?: string;
  qrId?: string;
  status?: string;
  valueInCents?: number;
  pixKey?: string;
  payerName?: string;
  payerTaxNumber?: string;
  blockchainTxID?: string;
  bankTxId?: string;
  [key: string]: unknown;
}

const PAID_ONCHAIN_STATUSES = new Set(["depix_sent"]);
const PIX_APPROVED_STATUSES = new Set(["approved"]);
const EXPIRED_STATUSES = new Set(["expired"]);
const FAILED_STATUSES = new Set(["refunded", "will_refund", "canceled", "error"]);

/**
 * Nome do pagador vindo da Eulen (`payerName`), pronto pra mesclar no `data:` de
 * um update. Retorna `{}` se ausente — assim NUNCA sobrescreve com null/undefined.
 */
function payerNamePatch(payload: EulenDepositPayload): { payerName?: string } {
  const name = typeof payload.payerName === "string" ? payload.payerName.trim() : "";
  return name ? { payerName: name } : {};
}

/**
 * Processa o webhook de DEPOSITO da Eulen.
 *
 * - `approved`  : PIX recebido — marca pixApprovedAt (UX "confirmando na rede").
 *                 NAO credita (o DePix ainda nao chegou on-chain).
 * - `depix_sent`: a Eulen enviou o DePix on-chain (com blockchainTxID). Faz o
 *                 CROSS-CHECK on-chain (>=2 conf + amount confere) e credita
 *                 (COMPLETED) na hora. Se ainda nao confirmado, fica PROCESSING e
 *                 o monitor LWK + cron completam (rede de seguranca).
 * - expired/refunded/canceled/error: finaliza a tx + propaga p/ QuickSale.
 */
export async function handleEulenDepositWebhook(
  payload: EulenDepositPayload,
  sourceIp: string | null,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const qrId = payload.qrId;
  const statusRaw = (payload.status ?? "").toLowerCase();

  if (!qrId) {
    return { status: 400, body: { error: "missing qrId" } };
  }

  // Idempotencia por (qrId, status).
  const eventKey = `${qrId}:${statusRaw}`;
  const isNew = await recordWebhookEvent({
    provider: "eulen_deposit",
    eventId: eventKey,
    eventType: statusRaw,
    sourceIp,
    signatureValid: true,
    payload,
  });
  if (!isNew) {
    logger.info("Eulen-deposit webhook: evento duplicado", { eventKey });
    return { status: 200, body: { ok: true, duplicate: true } };
  }

  const txRow = await withAdmin((tx) =>
    tx.tenantDepixTransaction.findFirst({
      where: { pixpayDepixId: qrId, kind: "DEPOSIT" },
      select: {
        id: true,
        tenantId: true,
        status: true,
        depositLabel: true,
        depositAddress: true,
        depositReceivingTenantId: true,
      },
    }),
  );
  if (!txRow) {
    await markWebhookProcessed("eulen_deposit", eventKey, { ok: false, errorMessage: "not_found" });
    logger.warn("Eulen-deposit webhook: deposito desconhecido", { qrId, statusRaw });
    return { status: 200, body: { ok: true, matched: false } };
  }

  // ── PIX aprovado: o cliente pagou (fiat caiu). Marca PROCESSING na hora
  //    (pagamento confirmado, aguardando o DePix on-chain) e LIBERA a venda
  //    (PDV/QuickSale). NAO credita saldo (isso e COMPLETED, on-chain).
  if (PIX_APPROVED_STATUSES.has(statusRaw)) {
    await withAdmin((tx) =>
      tx.tenantDepixTransaction.updateMany({
        where: { id: txRow.id, status: "PENDING" },
        data: { status: "PROCESSING", pixApprovedAt: new Date(), ...payerNamePatch(payload) },
      }),
    );
    // Efeito de venda (QuickSale->PAID + notify SSE). Tenant REAL (a venda e
    // dele, nao da carteira de taxas). Idempotente.
    await applyPixReceivedEffects(txRow.tenantId, txRow.id);
    await markWebhookProcessed("eulen_deposit", eventKey, { ok: true });
    return { status: 200, body: { ok: true, pixApproved: true } };
  }

  // ── DePix enviado on-chain: cross-check + credita ──
  if (PAID_ONCHAIN_STATUSES.has(statusRaw)) {
    const blockchainTxId = payload.blockchainTxID;
    if (!blockchainTxId) {
      // Sem txid nao da pra cross-check; deixa o monitor on-chain creditar o
      // saldo. Mas o PIX ja caiu -> marca PROCESSING + libera a venda (idempotente).
      await withAdmin((tx) =>
        tx.tenantDepixTransaction.updateMany({
          where: { id: txRow.id, status: "PENDING" },
          data: { status: "PROCESSING", pixApprovedAt: new Date(), ...payerNamePatch(payload) },
        }),
      );
      await applyPixReceivedEffects(txRow.tenantId, txRow.id);
      await markWebhookProcessed("eulen_deposit", eventKey, { ok: true });
      return { status: 200, body: { ok: true, depixSent: true, awaitingMonitor: true } };
    }

    // Ja concluido? idempotente.
    if (["COMPLETED", "COMPLETED_FEE_PENDING", "PROCESSING_FEE"].includes(txRow.status)) {
      await markWebhookProcessed("eulen_deposit", eventKey, { ok: true });
      return { status: 200, body: { ok: true, alreadySettling: true } };
    }

    const feeWalletTenantId = await getFeeWalletTenantId();
    const receivingTenantId = txRow.depositReceivingTenantId ?? txRow.tenantId;
    const isFeeWalletDeposit = !!feeWalletTenantId && receivingTenantId === feeWalletTenantId;
    const expectedAmount = (payload.valueInCents ?? 0) / 100;

    // Grava o txid e marca PROCESSING antes do cross-check.
    await withAdmin((tx) =>
      tx.tenantDepixTransaction.updateMany({
        where: { id: txRow.id, status: { in: ["PENDING", "PROCESSING"] } },
        data: { status: "PROCESSING", depositTxId: blockchainTxId, pixApprovedAt: new Date(), ...payerNamePatch(payload) },
      }),
    );

    // Cross-check on-chain (forca sync do LWK; exige >=2 conf + amount confere).
    const crossCheck = await verifyDepositOnChain({
      tenantId: receivingTenantId,
      txid: blockchainTxId,
      expectedAmount,
      expectedAddress: txRow.depositAddress ?? null,
    });
    if (!crossCheck.ok) {
      // Ainda nao confirmado (broadcast recente) ou divergencia: NAO credita.
      // O monitor LWK + cron completam quando confirmar (rede de seguranca).
      await markWebhookProcessed("eulen_deposit", eventKey, { ok: true });
      logger.info("Eulen-deposit webhook: depix_sent ainda nao confirmado on-chain", {
        qrId,
        reason: crossCheck.reason,
      });
      return { status: 200, body: { ok: true, depixSent: true, awaitingConfirmation: true } };
    }

    try {
      const result = isFeeWalletDeposit
        ? await settleDepositViaFeeWallet({
            feeWalletTenantId: receivingTenantId,
            depositLabel: txRow.depositLabel ?? "",
            depositTxId: blockchainTxId,
            depixAmount: crossCheck.onchainAmount,
            confirmations: 2,
          })
        : await settleDepositConfirmed({
            tenantId: receivingTenantId,
            depositLabel: txRow.depositLabel ?? "",
            depositTxId: blockchainTxId,
            depixAmount: crossCheck.onchainAmount,
            confirmations: 2,
          });
      await markWebhookProcessed("eulen_deposit", eventKey, { ok: true });
      logger.info("Eulen-deposit webhook: deposito creditado via webhook", { qrId, id: txRow.id });
      return { status: 200, body: { ok: true, ...result } };
    } catch (err) {
      logger.error("Eulen-deposit webhook: settle erro", {
        qrId,
        err: err instanceof Error ? err.message : String(err),
      });
      await markWebhookProcessed("eulen_deposit", eventKey, { ok: false, errorMessage: String(err) });
      // 200: o monitor on-chain ainda completa.
      return { status: 200, body: { ok: true, error: "settle_failed_fallback_monitor" } };
    }
  }

  // ── Expirado / falho ──
  if (EXPIRED_STATUSES.has(statusRaw) || FAILED_STATUSES.has(statusRaw)) {
    const outcome = EXPIRED_STATUSES.has(statusRaw) ? "EXPIRED" : "FAILED";
    await withAdmin((tx) =>
      tx.tenantDepixTransaction.updateMany({
        // So finaliza quem ainda nao concluiu (nao reverte um COMPLETED).
        where: { id: txRow.id, status: { in: ["PENDING", "PROCESSING"] } },
        data: {
          status: outcome,
          completedAt: new Date(),
          errorMessage: outcome === "EXPIRED" ? "PIX expirou" : `Deposito ${statusRaw}`,
          apiResponse: payload as never,
        },
      }),
    );
    await propagateDepositNotPaid(qrId, outcome);
    await markWebhookProcessed("eulen_deposit", eventKey, { ok: true });
    return { status: 200, body: { ok: true, finalized: outcome } };
  }

  // pending / under_review / delayed: ack.
  await markWebhookProcessed("eulen_deposit", eventKey, { ok: true });
  return { status: 200, body: { ok: true, ignored: statusRaw } };
}
