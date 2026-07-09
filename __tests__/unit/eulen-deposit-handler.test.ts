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
const getPixStatus = vi.fn();

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
// Revalidacao anti-forja do `approved` (S1/S2): consulta ativa a Eulen.
// isDepixConfigured=true para exercitar a revalidacao (sem config, ela e pulada).
vi.mock("@/lib/services/depix-service", () => ({
  getPixStatus: (...a: unknown[]) => getPixStatus(...a),
  isDepixConfigured: () => true,
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
    isByow: false,
    ...over,
  };
}

beforeEach(() => {
  for (const m of [
    findFirst, updateMany, recordWebhookEvent, markWebhookProcessed,
    verifyDepositOnChain, settleDepositConfirmed, settleDepositViaFeeWallet,
    getFeeWalletTenantId, propagateDepositNotPaid, applyPixReceivedEffects,
    getPixStatus,
  ]) m.mockReset();
  recordWebhookEvent.mockResolvedValue(true);
  updateMany.mockResolvedValue({ count: 1 });
  markWebhookProcessed.mockResolvedValue(undefined);
  getFeeWalletTenantId.mockResolvedValue("fee-tenant");
  findFirst.mockResolvedValue(tx());
  // Default: a Eulen CORROBORA o `approved` (caminho feliz). Casos específicos
  // sobrescrevem para pending/erro (revalidação anti-forja S1/S2).
  getPixStatus.mockResolvedValue({ success: true, status: "pix_received", isFinal: false });
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
    // Revalidou com a Eulen (canal ativo, timeout curto) antes de liberar (S1/S2).
    expect(getPixStatus).toHaveBeenCalledWith("q1", expect.objectContaining({ timeoutMs: expect.any(Number) }));
  });

  it("approved NAO corroborado pela Eulen (status pending) -> NAO libera a venda (anti-forja S1/S2)", async () => {
    getPixStatus.mockResolvedValue({ success: true, status: "pending", isFinal: false });
    const res = await handleEulenDepositWebhook(
      { webhookType: "deposit", qrId: "q1", status: "approved", valueInCents: 10000 },
      null,
    );
    // Ainda marca PROCESSING (o PIX pode ter caido), mas NAO libera a venda.
    expect(updateMany).toHaveBeenCalled();
    expect(applyPixReceivedEffects).not.toHaveBeenCalled();
    expect(res.body).toMatchObject({ pixApproved: true, saleReleased: false });
  });

  it("approved com Eulen INDISPONIVEL (getPixStatus falha) -> NAO libera a venda (fail-safe)", async () => {
    getPixStatus.mockResolvedValue({ success: false, error: "Depix HTTP 503" });
    const res = await handleEulenDepositWebhook(
      { webhookType: "deposit", qrId: "q1", status: "approved", valueInCents: 10000 },
      null,
    );
    expect(applyPixReceivedEffects).not.toHaveBeenCalled();
    expect(res.body).toMatchObject({ saleReleased: false });
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
    // Cross-check chamado com timeout CURTO (nao segurar o webhook alem do SLA).
    expect(verifyDepositOnChain).toHaveBeenCalledWith(
      expect.objectContaining({ lwkTimeoutMs: expect.any(Number) }),
    );
    expect(settleDepositConfirmed).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT, depositTxId: "bc1", depixAmount: 100 }),
    );
    expect(res.body).toMatchObject({ completed: true });
  });

  it("depix_sent com LWK lento/indisponivel -> NAO credita, fica PROCESSING (cron completa)", async () => {
    // Regressao do timeout de webhook (08/07): LWK travou e o cross-check
    // retornou lwk_unavailable dentro do teto curto. NAO credita; a rede de
    // seguranca (cron) completa depois. O webhook responde 200 rapido.
    verifyDepositOnChain.mockResolvedValue({ ok: false, reason: "lwk_unavailable: LWK indisponivel", onchainAmount: 0 });
    const res = await handleEulenDepositWebhook(
      { webhookType: "deposit", qrId: "q2", status: "depix_sent", valueInCents: 10000, blockchainTxID: "bc1" },
      null,
    );
    expect(settleDepositConfirmed).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ awaitingConfirmation: true });
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

  it("BYOW depix_sent -> COMPLETED via valueInCents, SEM cross-check nem settle LWK", async () => {
    findFirst.mockResolvedValue(tx({ isByow: true }));
    const res = await handleEulenDepositWebhook(
      { webhookType: "deposit", qrId: "qb", status: "depix_sent", valueInCents: 9800, blockchainTxID: "bc-byow" },
      null,
    );
    // Não toca no LWK (a Arena não custodia o endereço BYOW).
    expect(verifyDepositOnChain).not.toHaveBeenCalled();
    expect(settleDepositConfirmed).not.toHaveBeenCalled();
    expect(settleDepositViaFeeWallet).not.toHaveBeenCalled();
    // Marca COMPLETED com o valor da Eulen; libera a venda.
    expect(updateMany.mock.calls[0]![0]).toMatchObject({
      data: { status: "COMPLETED", netAmountCents: 9800, depositTxId: "bc-byow" },
    });
    expect(applyPixReceivedEffects).toHaveBeenCalledWith(TENANT, "tx-1");
    expect(res.body).toMatchObject({ byow: true, completed: true });
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
