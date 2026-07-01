/**
 * handleEulenDepositWebhook: approved->pixApprovedAt (sem credito);
 * depix_sent confirmado on-chain -> settle (COMPLETED); depix_sent NAO
 * confirmado -> PROCESSING sem creditar; expired/error -> finaliza + propaga;
 * idempotencia.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const findFirst = vi.fn();
const updateMany = vi.fn();
const recordWebhookEvent = vi.fn();
const markWebhookProcessed = vi.fn();
const verifyDepositOnChain = vi.fn();
const settleDepositConfirmed = vi.fn();
const settleDepositViaFeeWallet = vi.fn();
const getFeeWalletTenantId = vi.fn();
const propagateDepositNotPaid = vi.fn();
const applyPixReceivedEffects = vi.fn();

vi.mock("@/server/db", () => ({
  withAdmin: (fn: (tx: unknown) => unknown) =>
    fn({ tenantDepixTransaction: { findFirst, updateMany } }),
}));
vi.mock("@/lib/webhooks/replay-guard", () => ({
  recordWebhookEvent: (...a: unknown[]) => recordWebhookEvent(...a),
  markWebhookProcessed: (...a: unknown[]) => markWebhookProcessed(...a),
}));
vi.mock("@/lib/webhooks/lwk-deposit-handler", () => ({
  verifyDepositOnChain: (...a: unknown[]) => verifyDepositOnChain(...a),
}));
vi.mock("@/lib/webhooks/depix-deposit-propagate", () => ({
  propagateDepositNotPaid: (...a: unknown[]) => propagateDepositNotPaid(...a),
}));
vi.mock("@/server/services/depix-transaction.service", () => ({
  settleDepositConfirmed: (...a: unknown[]) => settleDepositConfirmed(...a),
  settleDepositViaFeeWallet: (...a: unknown[]) => settleDepositViaFeeWallet(...a),
  applyPixReceivedEffects: (...a: unknown[]) => applyPixReceivedEffects(...a),
  depositUnderpayToleranceCents: () => Promise.resolve(99),
}));
vi.mock("@/server/services/depix-fee-wallet.service", () => ({
  getFeeWalletTenantId: (...a: unknown[]) => getFeeWalletTenantId(...a),
}));

import { handleEulenDepositWebhook } from "@/lib/webhooks/eulen-deposit-handler";

const TENANT = "11111111-1111-1111-1111-111111111111";

function tx(over: Record<string, unknown> = {}) {
  return {
    id: "tx-1",
    tenantId: TENANT,
    status: "PENDING",
    depositLabel: "tx-1",
    depositAddress: "lq1addr",
    depositReceivingTenantId: null,
    ...over,
  };
}

beforeEach(() => {
  for (const m of [
    findFirst, updateMany, recordWebhookEvent, markWebhookProcessed,
    verifyDepositOnChain, settleDepositConfirmed, settleDepositViaFeeWallet,
    getFeeWalletTenantId, propagateDepositNotPaid, applyPixReceivedEffects,
  ]) m.mockReset();
  recordWebhookEvent.mockResolvedValue(true);
  updateMany.mockResolvedValue({ count: 1 });
  markWebhookProcessed.mockResolvedValue(undefined);
  getFeeWalletTenantId.mockResolvedValue("fee-tenant");
  findFirst.mockResolvedValue(tx());
});

describe("handleEulenDepositWebhook", () => {
  it("approved -> marca pixApprovedAt, LIBERA venda, NAO credita saldo", async () => {
    const res = await handleEulenDepositWebhook(
      { webhookType: "deposit", qrId: "q1", status: "approved", valueInCents: 10000 },
      null,
    );
    expect(res.body).toMatchObject({ pixApproved: true });
    const data = updateMany.mock.calls[0]![0] as { data: { pixApprovedAt: unknown } };
    expect(data.data.pixApprovedAt).toBeInstanceOf(Date);
    // Libera a venda na hora (PIX recebido) com o tenant REAL...
    expect(applyPixReceivedEffects).toHaveBeenCalledWith(TENANT, "tx-1");
    // ...mas NAO credita saldo (isso so no on-chain/COMPLETED).
    expect(settleDepositConfirmed).not.toHaveBeenCalled();
    expect(settleDepositViaFeeWallet).not.toHaveBeenCalled();
  });

  it("approved -> persiste o nome do pagador (payerName) quando a Eulen envia", async () => {
    await handleEulenDepositWebhook(
      { webhookType: "deposit", qrId: "q1", status: "approved", valueInCents: 10000, payerName: "  Maria Souza  " },
      null,
    );
    const data = updateMany.mock.calls[0]![0] as { data: { payerName?: string } };
    expect(data.data.payerName).toBe("Maria Souza"); // trim aplicado
  });

  it("approved sem payerName -> NAO escreve o campo (nao sobrescreve com null)", async () => {
    await handleEulenDepositWebhook(
      { webhookType: "deposit", qrId: "q1", status: "approved", valueInCents: 10000 },
      null,
    );
    const data = updateMany.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect("payerName" in data.data).toBe(false);
  });

  it("depix_sent confirmado on-chain -> settle COMPLETED (custodial)", async () => {
    verifyDepositOnChain.mockResolvedValue({ ok: true, onchainAmount: 100 });
    settleDepositConfirmed.mockResolvedValue({ matched: true, completed: true });
    const res = await handleEulenDepositWebhook(
      { webhookType: "deposit", qrId: "q2", status: "depix_sent", valueInCents: 10000, blockchainTxID: "bc1" },
      null,
    );
    expect(verifyDepositOnChain).toHaveBeenCalled();
    expect(settleDepositConfirmed).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT, depositTxId: "bc1", depixAmount: 100 }),
    );
    expect(res.body).toMatchObject({ completed: true });
  });

  it("depix_sent na carteira de taxas -> settleDepositViaFeeWallet", async () => {
    findFirst.mockResolvedValue(tx({ depositReceivingTenantId: "fee-tenant" }));
    verifyDepositOnChain.mockResolvedValue({ ok: true, onchainAmount: 100 });
    settleDepositViaFeeWallet.mockResolvedValue({ matched: true, completed: true });
    await handleEulenDepositWebhook(
      { webhookType: "deposit", qrId: "q3", status: "depix_sent", valueInCents: 10000, blockchainTxID: "bc1" },
      null,
    );
    expect(settleDepositViaFeeWallet).toHaveBeenCalledWith(
      expect.objectContaining({ feeWalletTenantId: "fee-tenant" }),
    );
    expect(settleDepositConfirmed).not.toHaveBeenCalled();
  });

  it("depix_sent ainda NAO confirmado -> PROCESSING sem creditar", async () => {
    verifyDepositOnChain.mockResolvedValue({ ok: false, reason: "insufficient_confirmations", onchainAmount: 0 });
    const res = await handleEulenDepositWebhook(
      { webhookType: "deposit", qrId: "q4", status: "depix_sent", valueInCents: 10000, blockchainTxID: "bc1" },
      null,
    );
    expect(res.body).toMatchObject({ awaitingConfirmation: true });
    expect(settleDepositConfirmed).not.toHaveBeenCalled();
    // gravou o depositTxId + PROCESSING
    const data = updateMany.mock.calls[0]![0] as { data: { status: string; depositTxId: string } };
    expect(data.data.status).toBe("PROCESSING");
    expect(data.data.depositTxId).toBe("bc1");
  });

  it("expired -> tx EXPIRED + propaga QuickSale", async () => {
    const res = await handleEulenDepositWebhook(
      { webhookType: "deposit", qrId: "q5", status: "expired", valueInCents: 10000 },
      null,
    );
    expect(res.body).toMatchObject({ finalized: "EXPIRED" });
    expect(propagateDepositNotPaid).toHaveBeenCalledWith("q5", "EXPIRED");
  });

  it("error -> tx FAILED + propaga", async () => {
    await handleEulenDepositWebhook(
      { webhookType: "deposit", qrId: "q6", status: "error", valueInCents: 10000 },
      null,
    );
    expect(propagateDepositNotPaid).toHaveBeenCalledWith("q6", "FAILED");
  });

  it("evento duplicado -> 200 sem buscar tx", async () => {
    recordWebhookEvent.mockResolvedValue(false);
    const res = await handleEulenDepositWebhook(
      { webhookType: "deposit", qrId: "q1", status: "approved" },
      null,
    );
    expect(res.body).toMatchObject({ duplicate: true });
    expect(findFirst).not.toHaveBeenCalled();
  });
});
