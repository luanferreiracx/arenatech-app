import { withAdmin } from "@/server/db";
import { logger } from "@/lib/logger";
import { recordWebhookEvent, markWebhookProcessed } from "@/lib/webhooks/replay-guard";
import { verifyDepositOnChain } from "@/lib/webhooks/verify-deposit-onchain";
import {
  ensureStaticQrDepositTx,
  settleDepositConfirmed,
  depositUnderpayToleranceCents,
} from "@/server/services/depix-transaction.service";
import type { EulenDepositPayload } from "@/lib/webhooks/eulen-deposit-handler";

const PAID_ONCHAIN = new Set(["depix_sent"]);
const PIX_APPROVED = new Set(["approved"]);
const EXPIRED = new Set(["expired"]);
const FAILED = new Set(["refunded", "will_refund", "canceled", "error"]);

/**
 * Webhook de DEPOSITO da Eulen com `qrId` VAZIO = pagamento no QR PIX ESTATICO
 * (chave fixa da intermediadora). EXCLUSIVO do tenant central (arena-tech): cria
 * uma tx STATIC_QR na central, com valor + pagador, e credita on-chain (mesma
 * logica do deposito normal). O monitor LWK reporta estes como `no_label` (sem
 * match), entao o credito e feito AQUI via cross-check direto pelo blockchainTxID.
 */
export async function handleStaticQrDeposit(
  payload: EulenDepositPayload,
  sourceIp: string | null,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const statusRaw = (payload.status ?? "").toLowerCase();
  // Chave estavel do pagamento: PRIORIZA o `bankTxId`, que esta presente em TODOS
  // os webhooks do mesmo pagamento (approved, depix_sent...). O `blockchainTxID`
  // so aparece no `depix_sent` — usa-lo como chave criava DUAS tx pro mesmo
  // pagamento (uma no approved via bankTxId, outra no depix_sent via txid),
  // deixando a primeira orfa em PROCESSING. Fallback p/ blockchainTxID so se nao
  // houver bankTxId.
  const stableKey =
    (typeof payload.bankTxId === "string" && payload.bankTxId) ||
    (typeof payload.blockchainTxID === "string" && payload.blockchainTxID) ||
    "";
  if (!stableKey) {
    logger.warn("static-qr: webhook sem bankTxId/txid — ignorado", { statusRaw });
    return { status: 200, body: { ok: true, ignored: "no_stable_key" } };
  }

  // Idempotencia por (stableKey, status).
  const eventKey = `${stableKey}:${statusRaw}`;
  const isNew = await recordWebhookEvent({
    provider: "eulen_static",
    eventId: eventKey,
    eventType: statusRaw,
    sourceIp,
    signatureValid: true,
    payload,
  });
  if (!isNew) {
    return { status: 200, body: { ok: true, duplicate: true } };
  }

  // Garante a tx STATIC_QR na central (cria PENDING se nao existe).
  const tx = await ensureStaticQrDepositTx({
    stableKey,
    grossAmountCents: payload.valueInCents ?? 0,
    payerName: payload.payerName ?? null,
    payerTaxId: payload.payerTaxNumber ?? null,
    apiResponse: payload,
  });
  if (!tx) {
    await markWebhookProcessed("eulen_static", eventKey, { ok: false, errorMessage: "no_central" });
    return { status: 200, body: { ok: true, matched: false } };
  }

  // ── PIX aprovado: marca PROCESSING (pago, aguardando on-chain). Sem creditar.
  if (PIX_APPROVED.has(statusRaw)) {
    await withAdmin((t) =>
      t.tenantDepixTransaction.updateMany({
        where: { id: tx.id, status: "PENDING" },
        data: { status: "PROCESSING", pixApprovedAt: new Date() },
      }),
    );
    await markWebhookProcessed("eulen_static", eventKey, { ok: true });
    return { status: 200, body: { ok: true, pixApproved: true } };
  }

  // ── DePix enviado on-chain: cross-check + credita na central.
  if (PAID_ONCHAIN.has(statusRaw)) {
    const blockchainTxId = payload.blockchainTxID;
    if (!blockchainTxId) {
      await markWebhookProcessed("eulen_static", eventKey, { ok: true });
      return { status: 200, body: { ok: true, depixSent: true, awaitingTxid: true } };
    }
    if (["COMPLETED", "COMPLETED_FEE_PENDING", "PROCESSING_FEE"].includes(tx.status)) {
      await markWebhookProcessed("eulen_static", eventKey, { ok: true });
      return { status: 200, body: { ok: true, alreadySettling: true } };
    }

    await withAdmin((t) =>
      t.tenantDepixTransaction.updateMany({
        where: { id: tx.id, status: { in: ["PENDING", "PROCESSING"] } },
        data: { status: "PROCESSING", depositTxId: blockchainTxId, pixApprovedAt: new Date() },
      }),
    );

    const expectedAmount = (payload.valueInCents ?? 0) / 100;
    // Static-QR e central hoje (ZERO_FEE -> ~99c), mas usamos a mesma tolerancia por
    // taxa dos demais fluxos por consistencia/robustez (cobre split se um dia aplicar).
    const crossCheck = await verifyDepositOnChain({
      tenantId: tx.tenantId,
      txid: blockchainTxId,
      expectedAmount,
      expectedAddress: tx.depositAddress,
      maxUnderpayCents: await depositUnderpayToleranceCents(
        tx.tenantId,
        payload.valueInCents ?? Math.round(expectedAmount * 100),
      ),
    });
    if (!crossCheck.ok) {
      await markWebhookProcessed("eulen_static", eventKey, { ok: true });
      logger.info("static-qr: ainda nao confirmado on-chain", { id: tx.id, reason: crossCheck.reason });
      return { status: 200, body: { ok: true, depixSent: true, awaitingConfirmation: true } };
    }

    try {
      // Central tem taxa Arena = 0 -> settleDepositConfirmed marca COMPLETED direto.
      const result = await settleDepositConfirmed({
        tenantId: tx.tenantId,
        depositLabel: tx.depositLabel,
        depositTxId: blockchainTxId,
        depixAmount: crossCheck.onchainAmount,
        confirmations: 2,
      });
      await markWebhookProcessed("eulen_static", eventKey, { ok: true });
      logger.info("static-qr: creditado na central", { id: tx.id });
      return { status: 200, body: { ok: true, ...result } };
    } catch (err) {
      await markWebhookProcessed("eulen_static", eventKey, {
        ok: false,
        errorMessage: err instanceof Error ? err.message : String(err),
      });
      return { status: 200, body: { ok: true, error: "settle_failed" } };
    }
  }

  // ── Expirado / falho.
  if (EXPIRED.has(statusRaw) || FAILED.has(statusRaw)) {
    const outcome = EXPIRED.has(statusRaw) ? "EXPIRED" : "FAILED";
    await withAdmin((t) =>
      t.tenantDepixTransaction.updateMany({
        where: { id: tx.id, status: { in: ["PENDING", "PROCESSING"] } },
        data: { status: outcome, completedAt: new Date(), errorMessage: `QR estático ${statusRaw}` },
      }),
    );
    await markWebhookProcessed("eulen_static", eventKey, { ok: true });
    return { status: 200, body: { ok: true, finalized: outcome } };
  }

  // pending / under_review / delayed: ack (tx fica PENDING).
  await markWebhookProcessed("eulen_static", eventKey, { ok: true });
  return { status: 200, body: { ok: true, ignored: statusRaw } };
}
