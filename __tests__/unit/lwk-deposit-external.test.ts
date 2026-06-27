/**
 * handleLwkDepositWebhook — ramo SEM label (deposito on-chain EXTERNO):
 * `pending` so ACK; `confirmed` + cross-check ok -> registra EXTERNAL_DEPOSIT +
 * notifica; cross-check falha -> rejeita; idempotencia/replay nao re-notifica.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const webhookEventCreate = vi.fn();
const webhookEventUpdateMany = vi.fn();
const findFirst = vi.fn(); // getFeeWalletTenantId nao usa isto aqui
const verifyDepositOnChain = vi.fn();
const recordExternalOnchainDeposit = vi.fn();
const notifyDepixWebhook = vi.fn();
const getFeeWalletTenantId = vi.fn();

const adminTx = {
  depixWebhookEvent: { create: webhookEventCreate, updateMany: webhookEventUpdateMany },
  tenantDepixTransaction: { findFirst },
};

vi.mock("@/server/db", () => ({
  withAdmin: (fn: (t: typeof adminTx) => unknown) => fn(adminTx),
  withTenant: (_t: string, fn: (t: typeof adminTx) => unknown) => fn(adminTx),
}));

vi.mock("@/lib/webhooks/verify-deposit-onchain", () => ({
  verifyDepositOnChain: (...a: unknown[]) => verifyDepositOnChain(...a),
}));

vi.mock("@/server/services/depix-transaction.service", () => ({
  settleDepositConfirmed: vi.fn(),
  settleDepositViaFeeWallet: vi.fn(),
  recordExternalOnchainDeposit: (...a: unknown[]) => recordExternalOnchainDeposit(...a),
}));

vi.mock("@/server/services/depix-fee-wallet.service", () => ({
  getFeeWalletTenantId: (...a: unknown[]) => getFeeWalletTenantId(...a),
}));

vi.mock("@/lib/webhooks/eulen-webhook-notify", () => ({
  notifyDepixWebhook: (...a: unknown[]) => notifyDepixWebhook(...a),
}));

import {
  handleLwkDepositWebhook,
  type LwkDepositPayload,
} from "@/lib/webhooks/lwk-deposit-handler";

const TENANT = "11111111-1111-1111-1111-111111111111";

function payload(over: Partial<LwkDepositPayload> = {}): LwkDepositPayload {
  return {
    event: "deposit_received",
    status: "confirmed",
    tenant_id: TENANT,
    txid: "onchain-txid-1",
    confirmations: 2,
    depix: { amount: 25 }, // R$25
    // SEM label -> deposito externo
    ...over,
  };
}

beforeEach(() => {
  for (const m of [
    webhookEventCreate, webhookEventUpdateMany, findFirst, verifyDepositOnChain,
    recordExternalOnchainDeposit, notifyDepixWebhook, getFeeWalletTenantId,
  ]) m.mockReset();
  webhookEventCreate.mockResolvedValue({}); // evento novo (nao duplicado)
  webhookEventUpdateMany.mockResolvedValue({});
  getFeeWalletTenantId.mockResolvedValue(null);
});

describe("handleLwkDepositWebhook — deposito on-chain externo (sem label)", () => {
  it("pending sem label -> so ACK (nao registra)", async () => {
    const res = await handleLwkDepositWebhook(payload({ status: "pending" }), "1.2.3.4", true);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ external: true, status: "pending" });
    expect(verifyDepositOnChain).not.toHaveBeenCalled();
    expect(recordExternalOnchainDeposit).not.toHaveBeenCalled();
  });

  it("confirmed + cross-check ok -> registra EXTERNAL_DEPOSIT + notifica", async () => {
    verifyDepositOnChain.mockResolvedValue({ ok: true, onchainAmount: 25 });
    recordExternalOnchainDeposit.mockResolvedValue({ id: "tx-ext-1", created: true });

    const res = await handleLwkDepositWebhook(payload(), "1.2.3.4", true);
    expect(res.body).toMatchObject({ external: true, recorded: true });
    // Registrou com o valor VERIFICADO on-chain (nao o do payload).
    const recArgs = recordExternalOnchainDeposit.mock.calls[0]![0] as { amountCents: number; depositTxId: string };
    expect(recArgs.amountCents).toBe(2500);
    expect(recArgs.depositTxId).toBe("onchain-txid-1");
    // Notificou (linha criada).
    expect(notifyDepixWebhook).toHaveBeenCalled();
  });

  it("confirmed + cross-check FALHA -> rejeita, sem registrar nem notificar", async () => {
    verifyDepositOnChain.mockResolvedValue({ ok: false, reason: "amount_mismatch" });

    const res = await handleLwkDepositWebhook(payload(), "1.2.3.4", true);
    expect(res.body).toMatchObject({ external: true, rejected: true });
    expect(recordExternalOnchainDeposit).not.toHaveBeenCalled();
    expect(notifyDepixWebhook).not.toHaveBeenCalled();
  });

  it("replay (created:false) -> nao re-notifica", async () => {
    verifyDepositOnChain.mockResolvedValue({ ok: true, onchainAmount: 25 });
    recordExternalOnchainDeposit.mockResolvedValue({ id: "tx-ext-1", created: false });

    await handleLwkDepositWebhook(payload(), "1.2.3.4", true);
    expect(notifyDepixWebhook).not.toHaveBeenCalled();
  });

  it("evento duplicado (replay-guard) -> nao reprocessa", async () => {
    webhookEventCreate.mockRejectedValue(new Error("unique violation"));
    const res = await handleLwkDepositWebhook(payload(), "1.2.3.4", true);
    expect(res.body).toMatchObject({ duplicate: true });
    expect(verifyDepositOnChain).not.toHaveBeenCalled();
  });
});
