/**
 * Saque do modo CARTEIRA EXTERNA por intermediacao (Fase B).
 *
 * Foco no NUCLEO DE DINHEIRO:
 *  - settleExternalWithdrawInbound: matriz de decisao (repasse vs refund por
 *    underpay/overpay/janela-expirada/sem-endereco) + idempotencia (CAS de status).
 *  - processWithdrawForward: transfer idempotente, fee ledger no FORWARD, bump de
 *    tentativa na falha.
 * Banco/LWK/Eulen mockados.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── mocks de banco ──────────────────────────────────────────────────────────
const txFindUnique = vi.fn();
const txUpdateMany = vi.fn();
const txUpdate = vi.fn();
const fwdUpsert = vi.fn();
const fwdFindUnique = vi.fn();
const fwdUpdateMany = vi.fn();
const ledgerUpsert = vi.fn();

const dbTx = {
  tenantDepixTransaction: { findUnique: txFindUnique, updateMany: txUpdateMany, update: txUpdate },
  depixWithdrawForward: { upsert: fwdUpsert, findUnique: fwdFindUnique, updateMany: fwdUpdateMany },
  tenantDepixFeeLedger: { upsert: ledgerUpsert },
};

vi.mock("@/server/db", () => ({
  withAdmin: (fn: (tx: typeof dbTx) => unknown) => fn(dbTx),
  withTenant: (_t: string, fn: (tx: typeof dbTx) => unknown) => fn(dbTx),
}));

// getPrimaryByowAddress (endereco de refund) — importado dinamicamente.
const getPrimaryByowAddress = vi.fn();
vi.mock("@/server/services/depix-byow.service", () => ({
  getPrimaryByowAddress: (...a: unknown[]) => getPrimaryByowAddress(...a),
}));

// carteira de intermediacao + gas.
const getFeeWalletTenantId = vi.fn();
const ensureFeeWalletLbtc = vi.fn();
vi.mock("@/server/services/depix-fee-wallet.service", () => ({
  getFeeWalletTenantId: (...a: unknown[]) => getFeeWalletTenantId(...a),
  ensureFeeWalletLbtc: (...a: unknown[]) => ensureFeeWalletLbtc(...a),
  getFeeWalletMasterAddress: vi.fn(),
  getFeeRecipientAddress: vi.fn(),
}));

// lwk.transfer (o envio on-chain).
const transfer = vi.fn();
vi.mock("@/lib/services/lwk-service", () => ({
  transfer: (...a: unknown[]) => transfer(...a),
  generateAddress: vi.fn(),
  getBalance: vi.fn(),
  LBTC_ASSET_ID: "lbtc",
}));

// Eulen — nao usado aqui (mas o service importa).
vi.mock("@/lib/services/depix-service", () => ({
  createDepixWithdraw: vi.fn(),
  getPixStatus: vi.fn(),
  getDepixWithdrawStatus: vi.fn(),
  listEulenDeposits: vi.fn(),
}));

// Corta o grafo de import que puxa next-auth via @/server/api/trpc (mesmo conjunto
// de mocks do depix-onchain-withdraw.test.ts, que importa o mesmo service).
vi.mock("@/server/api/trpc", () => ({ CENTRAL_TENANT_SLUG: "arena-tech" }));
vi.mock("@/lib/depix/receipt-url", () => ({ extractDepixWithdrawReceiptUrl: () => null }));
vi.mock("@/lib/webhooks/depix-deposit-propagate", () => ({ propagateDepositNotPaid: vi.fn() }));
vi.mock("@/lib/webhooks/verify-deposit-onchain", () => ({ verifyDepositOnChain: vi.fn() }));
vi.mock("@/server/services/depix-lbtc-refill.service", () => ({ ensureLbtcFor: vi.fn() }));

import {
  settleExternalWithdrawInbound,
  processWithdrawForward,
} from "@/server/services/depix-transaction.service";

const TENANT = "11111111-1111-1111-1111-111111111111";
const FEE_WALLET = "22222222-2222-2222-2222-222222222222";
const WID = "33333333-3333-3333-3333-333333333333";
const EULEN_ADDR = "lq1qq-eulen-deposit-addr";
const BYOW_ADDR = "lq1qq-tenant-byow-addr";
const DEPOSIT_TXID = "inbound-txid-1";

// finalGross = depositAmount(10000) + feeArena(270) = 10270. forwardAmount = 10000.
const FINAL_GROSS = 10270;
const FEE_ARENA = 270;
const FORWARD_AMOUNT = FINAL_GROSS - FEE_ARENA; // 10000

function awaitingRow(over: Record<string, unknown> = {}) {
  return {
    id: WID,
    tenantId: TENANT,
    status: "AWAITING_DEPOSIT",
    grossAmountCents: FINAL_GROSS,
    feeArenaTechCents: FEE_ARENA,
    pixpayDepositAddress: EULEN_ADDR,
    // janela distante (nao expirada)
    expiresAt: new Date(Date.now() + 60 * 60_000),
    ...over,
  };
}

beforeEach(() => {
  for (const m of [
    txFindUnique, txUpdateMany, txUpdate, fwdUpsert, fwdFindUnique, fwdUpdateMany,
    ledgerUpsert, getPrimaryByowAddress, getFeeWalletTenantId, ensureFeeWalletLbtc, transfer,
  ]) m.mockReset();

  txUpdateMany.mockResolvedValue({ count: 1 }); // CAS ganha por padrao
  fwdUpsert.mockResolvedValue({ id: "fwd-1" });
  getPrimaryByowAddress.mockResolvedValue(BYOW_ADDR);
  getFeeWalletTenantId.mockResolvedValue(FEE_WALLET);
  ensureFeeWalletLbtc.mockResolvedValue(undefined);
  // processWithdrawForward (chamado inline) — por padrao acha o forward e transfere ok.
  fwdFindUnique.mockResolvedValue({
    id: "fwd-1", tenantId: TENANT, transactionId: WID, kind: "FORWARD",
    destinationAddress: EULEN_ADDR, amountCents: FORWARD_AMOUNT, status: "PENDING", attempts: 0,
  });
  fwdUpdateMany.mockResolvedValue({ count: 1 });
  txFindUnique.mockResolvedValue({ feeArenaTechCents: FEE_ARENA });
  transfer.mockResolvedValue({ success: true, txid: "forward-txid-1" });
});

describe("settleExternalWithdrawInbound — matriz de decisao", () => {
  it("valor exato: repassa pra Eulen (FORWARD) e marca PROCESSING", async () => {
    txFindUnique.mockResolvedValueOnce(awaitingRow()); // load da tx do saque
    const res = await settleExternalWithdrawInbound({
      withdrawId: WID, feeWalletTenantId: FEE_WALLET,
      depositTxId: DEPOSIT_TXID, receivedAmountCents: FINAL_GROSS, confirmations: 2,
    });
    expect(res.outcome).toBe("ext_withdraw_forwarding");
    // CAS AWAITING_DEPOSIT -> PROCESSING
    expect(txUpdateMany.mock.calls[0]![0]).toMatchObject({
      where: { id: WID, status: "AWAITING_DEPOSIT" },
      data: { status: "PROCESSING", depositTxId: DEPOSIT_TXID },
    });
    // enfileira FORWARD pro endereco Eulen com o valor exato do deposito Eulen.
    expect(fwdUpsert.mock.calls[0]![0]).toMatchObject({
      where: { transactionId: WID },
      create: { kind: "FORWARD", destinationAddress: EULEN_ADDR, amountCents: FORWARD_AMOUNT },
    });
  });

  it("underpay (recebeu menos): NAO repassa — refund integral + FAILED", async () => {
    txFindUnique.mockResolvedValueOnce(awaitingRow());
    const res = await settleExternalWithdrawInbound({
      withdrawId: WID, feeWalletTenantId: FEE_WALLET,
      depositTxId: DEPOSIT_TXID, receivedAmountCents: FINAL_GROSS - 500, confirmations: 2,
    });
    expect(res.outcome).toBe("ext_withdraw_refund_enqueued");
    expect(txUpdateMany.mock.calls[0]![0]).toMatchObject({
      where: { id: WID, status: "AWAITING_DEPOSIT" }, data: { status: "FAILED" },
    });
    // refund = valor INTEGRAL recebido (fee de rede e L-BTC, nao DePix).
    expect(fwdUpsert.mock.calls[0]![0]).toMatchObject({
      create: { kind: "REFUND", destinationAddress: BYOW_ADDR, amountCents: FINAL_GROSS - 500 },
    });
  });

  it("overpay (recebeu mais): NAO fica com o excesso — refund integral + FAILED", async () => {
    txFindUnique.mockResolvedValueOnce(awaitingRow());
    const res = await settleExternalWithdrawInbound({
      withdrawId: WID, feeWalletTenantId: FEE_WALLET,
      depositTxId: DEPOSIT_TXID, receivedAmountCents: FINAL_GROSS + 5000, confirmations: 2,
    });
    expect(res.outcome).toBe("ext_withdraw_refund_enqueued");
    expect(fwdUpsert.mock.calls[0]![0]).toMatchObject({
      create: { kind: "REFUND", amountCents: FINAL_GROSS + 5000 },
    });
  });

  it("janela da Eulen perto de expirar: refund (nao arrisca perda)", async () => {
    // expiresAt daqui a 1min < margem de 5min -> eulenExpired.
    txFindUnique.mockResolvedValueOnce(awaitingRow({ expiresAt: new Date(Date.now() + 60_000) }));
    const res = await settleExternalWithdrawInbound({
      withdrawId: WID, feeWalletTenantId: FEE_WALLET,
      depositTxId: DEPOSIT_TXID, receivedAmountCents: FINAL_GROSS, confirmations: 2,
    });
    expect(res.outcome).toBe("ext_withdraw_refund_enqueued");
    expect(fwdUpsert.mock.calls[0]![0]).toMatchObject({ create: { kind: "REFUND" } });
  });

  it("tolerancia simetrica: 2c a mais ainda repassa (nao refunda)", async () => {
    txFindUnique.mockResolvedValueOnce(awaitingRow());
    const res = await settleExternalWithdrawInbound({
      withdrawId: WID, feeWalletTenantId: FEE_WALLET,
      depositTxId: DEPOSIT_TXID, receivedAmountCents: FINAL_GROSS + 2, confirmations: 2,
    });
    expect(res.outcome).toBe("ext_withdraw_forwarding");
  });

  it("idempotente: tx que nao esta mais em AWAITING_DEPOSIT nao reprocessa", async () => {
    txFindUnique.mockResolvedValueOnce(awaitingRow({ status: "PROCESSING" }));
    const res = await settleExternalWithdrawInbound({
      withdrawId: WID, feeWalletTenantId: FEE_WALLET,
      depositTxId: DEPOSIT_TXID, receivedAmountCents: FINAL_GROSS, confirmations: 2,
    });
    expect(res.outcome).toBe("ext_withdraw_already_processed");
    expect(txUpdateMany).not.toHaveBeenCalled();
    expect(fwdUpsert).not.toHaveBeenCalled();
  });

  it("refund sem endereco BYOW cadastrado: nao enfileira, sinaliza retido", async () => {
    txFindUnique.mockResolvedValueOnce(awaitingRow());
    getPrimaryByowAddress.mockResolvedValue(null);
    const res = await settleExternalWithdrawInbound({
      withdrawId: WID, feeWalletTenantId: FEE_WALLET,
      depositTxId: DEPOSIT_TXID, receivedAmountCents: FINAL_GROSS - 500, confirmations: 2,
    });
    expect(res.outcome).toBe("ext_withdraw_refund_no_address");
  });
});

describe("processWithdrawForward — envio idempotente", () => {
  it("FORWARD com sucesso: CAS COMPLETED + grava withdrawTxId + fee ledger da taxa retida", async () => {
    await processWithdrawForward("fwd-1");
    expect(transfer).toHaveBeenCalledWith(
      FEE_WALLET,
      [{ to: EULEN_ADDR, amountBrl: FORWARD_AMOUNT / 100 }],
      { idempotencyKey: "fwd:fwd-1" },
    );
    // CAS forward -> COMPLETED
    expect(fwdUpdateMany.mock.calls[0]![0]).toMatchObject({
      where: { id: "fwd-1", status: { in: ["PENDING", "FAILED"] } },
      data: { status: "COMPLETED", forwardTxId: "forward-txid-1" },
    });
    // ledger da taxa Arena RETIDA (upsert por transactionId+kind).
    expect(ledgerUpsert.mock.calls[0]![0]).toMatchObject({
      create: { kind: "WITHDRAW", amountCents: FEE_ARENA, status: "SETTLED" },
    });
  });

  it("transfer falha: incrementa tentativa e mantem PENDING (fica pro cron)", async () => {
    transfer.mockResolvedValue({ success: false, error: "insufficient_lbtc" });
    await processWithdrawForward("fwd-1");
    expect(fwdUpdateMany.mock.calls.at(-1)![0]).toMatchObject({
      data: { attempts: { increment: 1 }, status: "PENDING" },
    });
    expect(ledgerUpsert).not.toHaveBeenCalled();
  });

  it("forward ja COMPLETED: no-op (nao reenvia on-chain)", async () => {
    fwdFindUnique.mockResolvedValue({
      id: "fwd-1", tenantId: TENANT, transactionId: WID, kind: "FORWARD",
      destinationAddress: EULEN_ADDR, amountCents: FORWARD_AMOUNT, status: "COMPLETED", attempts: 0,
    });
    await processWithdrawForward("fwd-1");
    expect(transfer).not.toHaveBeenCalled();
  });

  it("REFUND com sucesso: nao cria fee ledger (so grava o txid do reembolso)", async () => {
    fwdFindUnique.mockResolvedValue({
      id: "fwd-1", tenantId: TENANT, transactionId: WID, kind: "REFUND",
      destinationAddress: BYOW_ADDR, amountCents: FINAL_GROSS, status: "PENDING", attempts: 0,
    });
    await processWithdrawForward("fwd-1");
    expect(transfer).toHaveBeenCalledWith(
      FEE_WALLET, [{ to: BYOW_ADDR, amountBrl: FINAL_GROSS / 100 }], { idempotencyKey: "fwd:fwd-1" },
    );
    expect(ledgerUpsert).not.toHaveBeenCalled();
  });
});
