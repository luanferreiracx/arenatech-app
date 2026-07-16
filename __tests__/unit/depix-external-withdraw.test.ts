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

// lwk.transfer (o envio on-chain) + getBalance (gas L-BTC da arena-fees).
const transfer = vi.fn();
const getBalance = vi.fn();
vi.mock("@/lib/services/lwk-service", () => ({
  transfer: (...a: unknown[]) => transfer(...a),
  getBalance: (...a: unknown[]) => getBalance(...a),
  generateAddress: vi.fn(),
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
  refundHeldWithdraw,
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
    ledgerUpsert, getPrimaryByowAddress, getFeeWalletTenantId, ensureFeeWalletLbtc,
    transfer, getBalance,
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
  // Row do saque carregada pelo processWithdrawForward (janela distante + campos de taxa).
  txFindUnique.mockResolvedValue({
    tenantId: TENANT, grossAmountCents: FINAL_GROSS, feeArenaTechCents: FEE_ARENA,
    expiresAt: new Date(Date.now() + 60 * 60_000),
  });
  getBalance.mockResolvedValue({ success: true, lbtcSatoshis: 100_000 }); // gas de sobra
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

  it("underpay (recebeu menos): NAO move dinheiro — RETEM (HELD) pra revisao humana", async () => {
    txFindUnique.mockResolvedValueOnce(awaitingRow());
    const res = await settleExternalWithdrawInbound({
      withdrawId: WID, feeWalletTenantId: FEE_WALLET,
      depositTxId: DEPOSIT_TXID, receivedAmountCents: FINAL_GROSS - 500, confirmations: 2,
    });
    expect(res.outcome).toBe("ext_withdraw_held");
    // Marca HELD (nao move nada) e grava o valor recebido pro admin decidir.
    expect(txUpdateMany.mock.calls[0]![0]).toMatchObject({
      where: { id: WID, status: "AWAITING_DEPOSIT" },
      data: { status: "HELD", intermediationReceivedCents: FINAL_GROSS - 500 },
    });
    // NAO enfileira NENHUM envio (nem forward nem refund automatico).
    expect(fwdUpsert).not.toHaveBeenCalled();
  });

  it("overpay (recebeu mais): NAO fica com o excesso — RETEM (HELD)", async () => {
    txFindUnique.mockResolvedValueOnce(awaitingRow());
    const res = await settleExternalWithdrawInbound({
      withdrawId: WID, feeWalletTenantId: FEE_WALLET,
      depositTxId: DEPOSIT_TXID, receivedAmountCents: FINAL_GROSS + 5000, confirmations: 2,
    });
    expect(res.outcome).toBe("ext_withdraw_held");
    expect(fwdUpsert).not.toHaveBeenCalled();
  });

  it("janela da Eulen perto de expirar: RETEM (HELD) — nao arrisca perda nem move", async () => {
    txFindUnique.mockResolvedValueOnce(awaitingRow({ expiresAt: new Date(Date.now() + 60_000) }));
    const res = await settleExternalWithdrawInbound({
      withdrawId: WID, feeWalletTenantId: FEE_WALLET,
      depositTxId: DEPOSIT_TXID, receivedAmountCents: FINAL_GROSS, confirmations: 2,
    });
    expect(res.outcome).toBe("ext_withdraw_held");
    expect(fwdUpsert).not.toHaveBeenCalled();
  });

  it("tolerancia simetrica: 2c a mais ainda repassa (nao retem)", async () => {
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

  it("REFUND com sucesso: nao cria fee ledger + idempotencyKey PROPRIO (refund:)", async () => {
    fwdFindUnique.mockResolvedValue({
      id: "fwd-1", tenantId: TENANT, transactionId: WID, kind: "REFUND",
      destinationAddress: BYOW_ADDR, amountCents: FINAL_GROSS, status: "PENDING", attempts: 0,
    });
    await processWithdrawForward("fwd-1");
    // Chave PROPRIA do refund — nunca colide com a do repasse (fwd:).
    expect(transfer).toHaveBeenCalledWith(
      FEE_WALLET, [{ to: BYOW_ADDR, amountBrl: FINAL_GROSS / 100 }], { idempotencyKey: "refund:fwd-1" },
    );
    expect(ledgerUpsert).not.toHaveBeenCalled();
  });

  it("sem gás + janela válida (attempts=0): NÃO move nada — aguarda o gás (PENDING)", async () => {
    getBalance.mockResolvedValue({ success: true, lbtcSatoshis: 100 }); // < 300 = sem gás
    await processWithdrawForward("fwd-1");
    expect(transfer).not.toHaveBeenCalled();
    // Nao retem (janela ainda valida) nem reembolsa: so marca "aguardando gas".
    expect(txUpdateMany).not.toHaveBeenCalled();
    expect(fwdUpdateMany.mock.calls.at(-1)![0]).toMatchObject({ where: { id: "fwd-1", status: "PENDING" } });
  });

  it("janela vencida (attempts=0): NÃO repassa — RETÉM (HELD), reembolso é humano", async () => {
    txFindUnique.mockResolvedValue({
      tenantId: TENANT, grossAmountCents: FINAL_GROSS, feeArenaTechCents: FEE_ARENA,
      expiresAt: new Date(Date.now() + 60_000), // < margem 5min -> vencida
    });
    await processWithdrawForward("fwd-1");
    expect(transfer).not.toHaveBeenCalled();
    // Retem o saque (HELD) e NAO converte em reembolso automatico.
    const held = txUpdateMany.mock.calls.some(
      (c) => (c[0] as { data?: { status?: string } }).data?.status === "HELD",
    );
    expect(held).toBe(true);
    const kindChanged = fwdUpdateMany.mock.calls.some(
      (c) => (c[0] as { data?: { kind?: string } }).data?.kind === "REFUND",
    );
    expect(kindChanged).toBe(false);
  });

  it("janela vencida + tentativa prévia (attempts>0): RETÉM (HELD), nunca reembolsa sozinho", async () => {
    fwdFindUnique.mockResolvedValue({
      id: "fwd-1", tenantId: TENANT, transactionId: WID, kind: "FORWARD",
      destinationAddress: EULEN_ADDR, amountCents: FORWARD_AMOUNT, status: "PENDING", attempts: 2,
    });
    txFindUnique.mockResolvedValue({
      tenantId: TENANT, grossAmountCents: FINAL_GROSS, feeArenaTechCents: FEE_ARENA,
      expiresAt: new Date(Date.now() + 60_000),
    });
    await processWithdrawForward("fwd-1");
    const held = txUpdateMany.mock.calls.some(
      (c) => (c[0] as { data?: { status?: string } }).data?.status === "HELD",
    );
    expect(held).toBe(true);
    const kindChanged = fwdUpdateMany.mock.calls.some(
      (c) => (c[0] as { data?: { kind?: string } }).data?.kind === "REFUND",
    );
    expect(kindChanged).toBe(false);
  });
});

describe("refundHeldWithdraw (admin — reembolso humano)", () => {
  it("HELD: enfileira REFUND pro endereço allowlisted com o valor recebido", async () => {
    txFindUnique.mockResolvedValue({ id: WID, tenantId: TENANT, status: "HELD", intermediationReceivedCents: 9800 });
    fwdFindUnique.mockResolvedValue({
      id: "fwd-1", tenantId: TENANT, transactionId: WID, kind: "REFUND",
      destinationAddress: BYOW_ADDR, amountCents: 9800, status: "PENDING", attempts: 0,
    });
    const res = await refundHeldWithdraw(WID);
    expect(res.ok).toBe(true);
    // Destino = SO o endereço allowlisted do tenant; valor = o recebido.
    expect(fwdUpsert.mock.calls[0]![0]).toMatchObject({
      create: { kind: "REFUND", destinationAddress: BYOW_ADDR, amountCents: 9800 },
    });
  });

  it("não-HELD: recusa (só age em saque retido)", async () => {
    txFindUnique.mockResolvedValue({ id: WID, tenantId: TENANT, status: "PROCESSING", intermediationReceivedCents: 9800 });
    const res = await refundHeldWithdraw(WID);
    expect(res.ok).toBe(false);
    expect(fwdUpsert).not.toHaveBeenCalled();
  });

  it("tenant sem endereço allowlisted: recusa (não há destino permitido)", async () => {
    txFindUnique.mockResolvedValue({ id: WID, tenantId: TENANT, status: "HELD", intermediationReceivedCents: 9800 });
    getPrimaryByowAddress.mockResolvedValue(null);
    const res = await refundHeldWithdraw(WID);
    expect(res.ok).toBe(false);
    expect(fwdUpsert).not.toHaveBeenCalled();
  });
});
