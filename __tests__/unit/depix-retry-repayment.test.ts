/**
 * retryRepayment (ADR 0052, PR5): reprocessa um repasse PENDING da carteira de
 * taxas com a MESMA idempotencyKey. Banco/LWK mockados.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const repaymentFindUnique = vi.fn();
const repaymentUpdate = vi.fn();
const repaymentUpdateMany = vi.fn();
const txFindUnique = vi.fn();
const txUpdateMany = vi.fn();
const ledgerUpsert = vi.fn();
const transfer = vi.fn();
const getFeeWalletTenantId = vi.fn();

const tx = {
  depixDepositRepayment: {
    findUnique: repaymentFindUnique,
    update: repaymentUpdate,
    updateMany: repaymentUpdateMany,
  },
  tenantDepixTransaction: { findUnique: txFindUnique, updateMany: txUpdateMany },
  tenantDepixFeeLedger: { upsert: ledgerUpsert },
};

vi.mock("@/server/db", () => ({
  withAdmin: (fn: (t: typeof tx) => unknown) => fn(tx),
  withTenant: (_t: string, fn: (t: typeof tx) => unknown) => fn(tx),
}));

vi.mock("@/server/api/trpc", () => ({ CENTRAL_TENANT_SLUG: "arena-tech" }));

vi.mock("@/lib/services/lwk-service", () => ({
  transfer: (...a: unknown[]) => transfer(...a),
}));

vi.mock("@/server/services/depix-fee-wallet.service", () => ({
  getFeeWalletTenantId: (...a: unknown[]) => getFeeWalletTenantId(...a),
  ensureFeeWalletLbtc: vi.fn().mockResolvedValue(undefined),
}));

import { retryRepayment } from "@/server/services/depix-transaction.service";

const REPAYMENT_ID = "55555555-5555-5555-5555-555555555555";
const FEE_TENANT = "22222222-2222-2222-2222-222222222222";

beforeEach(() => {
  for (const m of [
    repaymentFindUnique, repaymentUpdate, repaymentUpdateMany, txFindUnique,
    txUpdateMany, ledgerUpsert, transfer, getFeeWalletTenantId,
  ]) m.mockReset();

  getFeeWalletTenantId.mockResolvedValue(FEE_TENANT);
  repaymentFindUnique.mockResolvedValue({
    id: REPAYMENT_ID,
    status: "PENDING",
    attempts: 0,
    tenantId: "11111111-1111-1111-1111-111111111111",
    transactionId: "33333333-3333-3333-3333-333333333333",
    destinationAddress: "lq1real",
    netAmountCents: 9751,
  });
  txFindUnique.mockResolvedValue({ feeArenaTechCents: 249, depositTxId: "deadbeef", status: "PROCESSING_FEE" });
  txUpdateMany.mockResolvedValue({ count: 1 });
  repaymentUpdateMany.mockResolvedValue({ count: 1 });
  ledgerUpsert.mockResolvedValue({});
  repaymentUpdate.mockResolvedValue({});
});

describe("retryRepayment", () => {
  it("conclui com a MESMA idempotencyKey repay:{id}", async () => {
    transfer.mockResolvedValue({ success: true, txid: "repay-txid" });
    const res = await retryRepayment(REPAYMENT_ID);
    expect(res.status).toBe("completed");
    expect(transfer.mock.calls[0]![0]).toBe(FEE_TENANT);
    expect(transfer.mock.calls[0]![2]).toMatchObject({ idempotencyKey: `repay:${REPAYMENT_ID}` });
    expect(ledgerUpsert).toHaveBeenCalled();
  });

  it("mantem PENDING e incrementa attempts quando o transfer falha de novo", async () => {
    transfer.mockResolvedValue({ success: false, error: "insufficient_lbtc" });
    const res = await retryRepayment(REPAYMENT_ID);
    expect(res.status).toBe("pending");
    const upd = repaymentUpdate.mock.calls[0]![0] as { data: { attempts: unknown } };
    expect(upd.data.attempts).toEqual({ increment: 1 });
    expect(repaymentUpdateMany).not.toHaveBeenCalled();
  });

  it("skip quando ja COMPLETED (idempotente, nao re-transfere)", async () => {
    repaymentFindUnique.mockResolvedValue({ id: REPAYMENT_ID, status: "COMPLETED" });
    const res = await retryRepayment(REPAYMENT_ID);
    expect(res).toMatchObject({ status: "skipped", reason: "already_completed" });
    expect(transfer).not.toHaveBeenCalled();
  });

  it("skip quando a carteira de taxas nao existe", async () => {
    getFeeWalletTenantId.mockResolvedValue(null);
    const res = await retryRepayment(REPAYMENT_ID);
    expect(res).toMatchObject({ status: "skipped", reason: "fee_wallet_missing" });
    expect(transfer).not.toHaveBeenCalled();
  });

  it("esgota o teto de tentativas -> FAILED (para de reprocessar no cron)", async () => {
    // attempts ja em MAX-1: a falha desta tentativa atinge o teto.
    repaymentFindUnique.mockResolvedValue({
      id: REPAYMENT_ID,
      status: "PENDING",
      attempts: 7, // MAX_REPAYMENT_ATTEMPTS = 8 → 7+1 esgota
      tenantId: "11111111-1111-1111-1111-111111111111",
      transactionId: "33333333-3333-3333-3333-333333333333",
      destinationAddress: "lq1real",
      netAmountCents: 9751,
    });
    transfer.mockResolvedValue({ success: false, error: "insufficient_lbtc" });
    const res = await retryRepayment(REPAYMENT_ID);
    expect(res.status).toBe("failed");
    const upd = repaymentUpdate.mock.calls[0]![0] as { data: { status?: string } };
    expect(upd.data.status).toBe("FAILED");
  });

  it("nao reprocessa repasse ja FAILED no cron (auto)", async () => {
    repaymentFindUnique.mockResolvedValue({
      id: REPAYMENT_ID,
      status: "FAILED",
      attempts: 8,
      tenantId: "11111111-1111-1111-1111-111111111111",
      transactionId: "33333333-3333-3333-3333-333333333333",
      destinationAddress: "lq1real",
      netAmountCents: 9751,
    });
    const res = await retryRepayment(REPAYMENT_ID);
    expect(res).toMatchObject({ status: "skipped", reason: "exhausted" });
    expect(transfer).not.toHaveBeenCalled();
  });

  it("retry MANUAL reabre um FAILED e nao re-esgota (override do superadmin)", async () => {
    repaymentFindUnique.mockResolvedValue({
      id: REPAYMENT_ID,
      status: "FAILED",
      attempts: 20, // bem acima do teto
      tenantId: "11111111-1111-1111-1111-111111111111",
      transactionId: "33333333-3333-3333-3333-333333333333",
      destinationAddress: "lq1real",
      netAmountCents: 9751,
    });
    transfer.mockResolvedValue({ success: false, error: "ainda fora" });
    const res = await retryRepayment(REPAYMENT_ID, { manual: true });
    // Manual nunca declara failed automaticamente: segue "pending" pra nova tentativa.
    expect(res.status).toBe("pending");
    const upd = repaymentUpdate.mock.calls[0]![0] as { data: { status?: string } };
    expect(upd.data.status).toBeUndefined();
  });
});
