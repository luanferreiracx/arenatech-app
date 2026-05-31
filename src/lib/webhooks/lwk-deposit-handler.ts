/**
 * Handler do webhook do monitor LWK (deposit_received).
 *
 * Payload (lwk/app.py build_payload):
 * {
 *   event: "deposit_received",
 *   status: "pending" | "confirmed",
 *   tenant_id: UUID,
 *   txid: string,
 *   confirmations: number,
 *   depix: { amount: number (BRL/DePix), asset_id, currency, formatted },
 *   all_assets: { [assetId]: {amount, satoshis, is_depix} },
 *   label: { label, user (= transactionId no nosso caso), address, ... },
 *   ...
 * }
 *
 * Idempotencia via DepixWebhookEvent (transactionId = `${txid}:${tenant_id}`,
 * eventType = status).
 */

import { withAdmin } from "@/server/db";
import { logger } from "@/lib/logger";
import { settleDepositConfirmed } from "@/server/services/depix-transaction.service";
import { withTenant } from "@/server/db";

export interface LwkDepositPayload {
  event?: string;
  status?: "pending" | "confirmed";
  tenant_id?: string;
  txid?: string;
  confirmations?: number;
  depix?: { amount?: number; asset_id?: string };
  label?: { user?: string; address?: string; label?: string };
}

export interface LwkHandlerResult {
  status: number;
  body: Record<string, unknown>;
}

export async function handleLwkDepositWebhook(
  payload: LwkDepositPayload,
  sourceIp: string | null,
  signatureValid: boolean,
): Promise<LwkHandlerResult> {
  if (payload.event !== "deposit_received") {
    return { status: 200, body: { ok: true, ignored: "not deposit_received" } };
  }
  const tenantId = payload.tenant_id;
  const txid = payload.txid;
  const status = payload.status;
  if (!tenantId || !txid || !status) {
    return { status: 400, body: { error: "missing tenant_id/txid/status" } };
  }

  // Idempotencia: insere evento, se ja existe = retorna ok.
  const eventKey = `${txid}:${tenantId}`;
  const isNew = await withAdmin(async (tx) => {
    try {
      await tx.depixWebhookEvent.create({
        data: {
          transactionId: eventKey,
          eventType: status,
          sourceIp,
          signatureValid,
          payload: payload as never,
          processed: false,
        },
      });
      return true;
    } catch {
      return false; // unique violation = duplicate
    }
  });
  if (!isNew) {
    logger.info("LWK webhook: evento duplicado", { eventKey, status });
    return { status: 200, body: { ok: true, duplicate: true } };
  }

  const depixAmount = Number(payload.depix?.amount ?? 0);
  if (depixAmount <= 0) {
    return { status: 200, body: { ok: true, ignored: "no depix amount" } };
  }

  const depositLabel = payload.label?.user ?? null;
  if (!depositLabel) {
    // Sem label: nao da pra matchar exato. Loga e registra como nao-matchado.
    logger.warn("LWK webhook sem label.user — sem match", { tenantId, txid });
    await markProcessed(eventKey, status, "no_label");
    return { status: 200, body: { ok: true, matched: false, reason: "no label" } };
  }

  if (status === "pending") {
    // Atualiza confirmations + status PROCESSING. Nao cobra taxa ainda.
    await withTenant(tenantId, async (tx) => {
      const row = await tx.tenantDepixTransaction.findFirst({
        where: {
          tenantId,
          kind: "DEPOSIT",
          depositLabel,
          status: { in: ["PENDING", "PROCESSING"] },
        },
      });
      if (row) {
        await tx.tenantDepixTransaction.update({
          where: { id: row.id },
          data: {
            status: "PROCESSING",
            depositTxId: txid,
            confirmations: payload.confirmations ?? 0,
          },
        });
      }
    });
    await markProcessed(eventKey, status, "pending_acked");
    return { status: 200, body: { ok: true, status: "pending" } };
  }

  // confirmed
  try {
    const result = await settleDepositConfirmed({
      tenantId,
      depositLabel,
      depositTxId: txid,
      depixAmount,
      confirmations: payload.confirmations ?? 0,
    });
    await markProcessed(
      eventKey,
      status,
      result.completed ? "completed" : result.feePending ? "fee_pending" : "matched",
    );
    return { status: 200, body: { ok: true, ...result } };
  } catch (err) {
    logger.error("LWK webhook: settleDepositConfirmed erro", {
      tenantId,
      txid,
      err: err instanceof Error ? err.message : String(err),
    });
    await markProcessed(eventKey, status, `error: ${String(err)}`);
    // 200 mesmo em erro pro LWK nao reenviar infinitamente — esta no log e
    // no DepixWebhookEvent.
    return { status: 200, body: { ok: true, error: "internal" } };
  }
}

async function markProcessed(eventKey: string, status: string, finalStatus: string) {
  try {
    await withAdmin(async (tx) =>
      tx.depixWebhookEvent.updateMany({
        where: { transactionId: eventKey, eventType: status },
        data: { processed: true, finalStatus },
      }),
    );
  } catch {
    // best-effort
  }
}
