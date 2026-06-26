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
import {
  settleDepositConfirmed,
  settleDepositViaFeeWallet,
} from "@/server/services/depix-transaction.service";
import { getFeeWalletTenantId } from "@/server/services/depix-fee-wallet.service";
import { withTenant } from "@/server/db";
import * as lwk from "@/lib/services/lwk-service";
import {
  verifyDepositOnChain,
  type CrossCheckResult,
} from "@/lib/webhooks/verify-deposit-onchain";

// Reexporta pra compatibilidade com quem importava daqui.
export { verifyDepositOnChain, type CrossCheckResult };

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

  // ADR 0052: deposito de tenant non-custodial cai na CARTEIRA DE TAXAS
  // (arena-fees) — o webhook chega com tenant_id = arena-fees. A tx pertence ao
  // tenant real; achamos pelo label (UUID global). Custodial/central seguem o
  // caminho normal (tenant_id = o proprio tenant).
  const feeWalletTenantId = await getFeeWalletTenantId();
  const isFeeWalletDeposit = !!feeWalletTenantId && tenantId === feeWalletTenantId;

  if (status === "pending") {
    // Atualiza confirmations + status PROCESSING. Nao cobra taxa ainda.
    // Fee wallet: a tx pertence ao tenant real -> busca/atualiza via withAdmin
    // (o withTenant(arena-fees) nao enxerga a tx via RLS).
    if (isFeeWalletDeposit) {
      await withAdmin(async (tx) => {
        const row = await tx.tenantDepixTransaction.findFirst({
          where: { kind: "DEPOSIT", depositLabel, status: { in: ["PENDING", "PROCESSING"] } },
          select: { id: true },
        });
        if (row) {
          await tx.tenantDepixTransaction.update({
            where: { id: row.id },
            data: { status: "PROCESSING", depositTxId: txid, confirmations: payload.confirmations ?? 0 },
          });
        }
      });
    } else {
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
    }
    await markProcessed(eventKey, status, "pending_acked");
    return { status: 200, body: { ok: true, status: "pending" } };
  }

  // confirmed — cross-check on-chain antes de creditar (CRITICAL #1).
  // Defesa contra webhook spoofado: mesmo com HMAC valido, o atacante nao
  // controla a carteira on-chain, entao o registro on-chain eh a verdade.
  const crossCheck = await verifyDepositOnChain({
    tenantId,
    txid,
    expectedAmount: depixAmount,
    expectedAddress: payload.label?.address ?? null,
  });
  if (!crossCheck.ok) {
    logger.error("LWK webhook: cross-check on-chain falhou — rejeitando deposito", {
      tenantId,
      txid,
      reason: crossCheck.reason,
      payloadAmount: depixAmount,
      onchainAmount: crossCheck.onchainAmount,
    });
    await markProcessed(eventKey, status, `rejected: ${crossCheck.reason}`);
    return {
      status: 200,
      body: { ok: true, rejected: true, reason: crossCheck.reason },
    };
  }

  try {
    const result = isFeeWalletDeposit
      ? await settleDepositViaFeeWallet({
          feeWalletTenantId: tenantId,
          depositLabel,
          depositTxId: txid,
          depixAmount: crossCheck.onchainAmount,
          confirmations: payload.confirmations ?? 0,
        })
      : await settleDepositConfirmed({
          tenantId,
          depositLabel,
          depositTxId: txid,
          // Usa o valor VERIFICADO on-chain, nao o do payload.
          depixAmount: crossCheck.onchainAmount,
          confirmations: payload.confirmations ?? 0,
        });
    await markProcessed(
      eventKey,
      status,
      result.completed
        ? "completed"
        : "feePending" in result && result.feePending
          ? "fee_pending"
          : "repayPending" in result && result.repayPending
            ? "repay_pending"
            : "matched",
    );
    return { status: 200, body: { ok: true, ...result } };
  } catch (err) {
    logger.error("LWK webhook: settle deposito erro", {
      tenantId,
      txid,
      isFeeWalletDeposit,
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
