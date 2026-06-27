/**
 * handleStaticQrDeposit: pagamento no QR PIX estatico (deposit qrId vazio),
 * exclusivo da central. approved -> PROCESSING (sem creditar); depix_sent
 * confirmado -> settle; idempotencia; sem central -> matched:false.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const updateMany = vi.fn();
const recordWebhookEvent = vi.fn();
const markWebhookProcessed = vi.fn();
const verifyDepositOnChain = vi.fn();
const ensureStaticQrDepositTx = vi.fn();
const settleDepositConfirmed = vi.fn();

vi.mock("@/server/db", () => ({
  withAdmin: (fn: (tx: unknown) => unknown) => fn({ tenantDepixTransaction: { updateMany } }),
}));
vi.mock("@/lib/webhooks/replay-guard", () => ({
  recordWebhookEvent: (...a: unknown[]) => recordWebhookEvent(...a),
  markWebhookProcessed: (...a: unknown[]) => markWebhookProcessed(...a),
}));
vi.mock("@/lib/webhooks/verify-deposit-onchain", () => ({
  verifyDepositOnChain: (...a: unknown[]) => verifyDepositOnChain(...a),
}));
vi.mock("@/server/services/depix-transaction.service", () => ({
  ensureStaticQrDepositTx: (...a: unknown[]) => ensureStaticQrDepositTx(...a),
  settleDepositConfirmed: (...a: unknown[]) => settleDepositConfirmed(...a),
}));

import { handleStaticQrDeposit } from "@/lib/webhooks/eulen-static-qr-handler";

const CENTRAL = "central-tenant";

function tx(over: Record<string, unknown> = {}) {
  return {
    id: "stx-1",
    tenantId: CENTRAL,
    status: "PENDING",
    depositLabel: "static:bc1",
    depositAddress: "lq1master",
    ...over,
  };
}

beforeEach(() => {
  for (const m of [updateMany, recordWebhookEvent, markWebhookProcessed, verifyDepositOnChain, ensureStaticQrDepositTx, settleDepositConfirmed])
    m.mockReset();
  recordWebhookEvent.mockResolvedValue(true);
  updateMany.mockResolvedValue({ count: 1 });
  markWebhookProcessed.mockResolvedValue(undefined);
  ensureStaticQrDepositTx.mockResolvedValue(tx());
});

describe("handleStaticQrDeposit", () => {
  it("approved -> PROCESSING (pago), sem creditar", async () => {
    const res = await handleStaticQrDeposit(
      { webhookType: "deposit", qrId: "", status: "approved", valueInCents: 2000, blockchainTxID: "bc1", payerName: "Paulo" },
      null,
    );
    expect(res.body).toMatchObject({ pixApproved: true });
    expect(settleDepositConfirmed).not.toHaveBeenCalled();
    // cria a tx com valor + pagador
    expect(ensureStaticQrDepositTx).toHaveBeenCalledWith(
      expect.objectContaining({ grossAmountCents: 2000, payerName: "Paulo", stableKey: "bc1" }),
    );
  });

  it("depix_sent confirmado on-chain -> settle (credita na central)", async () => {
    verifyDepositOnChain.mockResolvedValue({ ok: true, onchainAmount: 19.01 });
    settleDepositConfirmed.mockResolvedValue({ matched: true, completed: true });
    const res = await handleStaticQrDeposit(
      { webhookType: "deposit", qrId: "", status: "depix_sent", valueInCents: 2000, blockchainTxID: "bc1" },
      null,
    );
    expect(verifyDepositOnChain).toHaveBeenCalled();
    expect(settleDepositConfirmed).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: CENTRAL, depositLabel: "static:bc1", depositTxId: "bc1", depixAmount: 19.01 }),
    );
    expect(res.body).toMatchObject({ completed: true });
  });

  it("depix_sent nao confirmado -> PROCESSING sem creditar", async () => {
    verifyDepositOnChain.mockResolvedValue({ ok: false, reason: "txid_not_found_onchain", onchainAmount: 0 });
    const res = await handleStaticQrDeposit(
      { webhookType: "deposit", qrId: "", status: "depix_sent", valueInCents: 2000, blockchainTxID: "bc1" },
      null,
    );
    expect(res.body).toMatchObject({ awaitingConfirmation: true });
    expect(settleDepositConfirmed).not.toHaveBeenCalled();
  });

  it("central nao encontrada -> matched:false", async () => {
    ensureStaticQrDepositTx.mockResolvedValue(null);
    const res = await handleStaticQrDeposit(
      { webhookType: "deposit", qrId: "", status: "approved", valueInCents: 2000, bankTxId: "bk1" },
      null,
    );
    expect(res.body).toMatchObject({ matched: false });
  });

  it("evento duplicado -> 200 sem criar tx", async () => {
    recordWebhookEvent.mockResolvedValue(false);
    const res = await handleStaticQrDeposit(
      { webhookType: "deposit", qrId: "", status: "approved", blockchainTxID: "bc1" },
      null,
    );
    expect(res.body).toMatchObject({ duplicate: true });
    expect(ensureStaticQrDepositTx).not.toHaveBeenCalled();
  });

  it("sem txid e sem bankTxId -> ignorado (sem chave estavel)", async () => {
    const res = await handleStaticQrDeposit(
      { webhookType: "deposit", qrId: "", status: "approved", valueInCents: 2000 },
      null,
    );
    expect(res.body).toMatchObject({ ignored: "no_stable_key" });
    expect(recordWebhookEvent).not.toHaveBeenCalled();
  });
});
