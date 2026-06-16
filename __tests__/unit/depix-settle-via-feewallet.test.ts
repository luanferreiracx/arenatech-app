/**
 * settleDepositViaFeeWallet (ADR 0052, PR4): deposito non-custodial cai na
 * carteira de taxas custodial; ela retem a taxa e repassa o liquido ao tenant.
 * Banco/LWK mockados — testa o roteamento, o enfileiramento do repasse e o
 * comportamento em falha (fila p/ retry, efeitos NAO liberados).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const txFindFirst = vi.fn(); // tx por label (withAdmin)
const txUpdateMany = vi.fn();
const txFindUnique = vi.fn(); // applyDepositBusinessEffects
const feeConfigFindUnique = vi.fn();
const walletFindUnique = vi.fn(); // master do tenant real
const repaymentUpsert = vi.fn();
const repaymentUpdate = vi.fn();
const repaymentUpdateMany = vi.fn();
const ledgerUpsert = vi.fn();
const transfer = vi.fn();

const tenantFindUnique = vi.fn();

// tx unico cobrindo withAdmin e withTenant (todas as tabelas usadas).
const tx = {
  tenant: { findUnique: tenantFindUnique },
  tenantDepixTransaction: {
    findFirst: txFindFirst,
    updateMany: txUpdateMany,
    findUnique: txFindUnique,
  },
  tenantDepixFeeConfig: { findUnique: feeConfigFindUnique },
  tenantDepixWallet: { findUnique: walletFindUnique },
  depixDepositRepayment: {
    upsert: repaymentUpsert,
    update: repaymentUpdate,
    updateMany: repaymentUpdateMany,
  },
  tenantDepixFeeLedger: { upsert: ledgerUpsert },
};

vi.mock("@/server/db", () => ({
  withAdmin: (fn: (t: typeof tx) => unknown) => fn(tx),
  withTenant: (_tenantId: string, fn: (t: typeof tx) => unknown) => fn(tx),
}));

vi.mock("@/server/api/trpc", () => ({ CENTRAL_TENANT_SLUG: "arena-tech" }));

vi.mock("@/lib/services/lwk-service", () => ({
  transfer: (...a: unknown[]) => transfer(...a),
}));

vi.mock("@/server/services/depix-fee-wallet.service", () => ({
  getFeeWalletTenantId: vi.fn(),
  ensureFeeWalletLbtc: vi.fn().mockResolvedValue(undefined),
}));

import { settleDepositViaFeeWallet } from "@/server/services/depix-transaction.service";

const FEE_TENANT = "22222222-2222-2222-2222-222222222222";
const REAL_TENANT = "11111111-1111-1111-1111-111111111111";
const TX_ID = "33333333-3333-3333-3333-333333333333";
const REPAYMENT_ID = "55555555-5555-5555-5555-555555555555";

const args = {
  feeWalletTenantId: FEE_TENANT,
  depositLabel: TX_ID,
  depositTxId: "deadbeef",
  depixAmount: 100, // R$100
  confirmations: 2,
};

beforeEach(() => {
  for (const m of [
    txFindFirst, txUpdateMany, txFindUnique, feeConfigFindUnique, walletFindUnique,
    repaymentUpsert, repaymentUpdate, repaymentUpdateMany, ledgerUpsert, transfer,
    tenantFindUnique,
  ]) m.mockReset();

  tenantFindUnique.mockResolvedValue(null); // tenant real nao e o central
  txFindFirst.mockResolvedValue({ id: TX_ID, tenantId: REAL_TENANT });
  feeConfigFindUnique.mockResolvedValue(null); // defaults (R$0,99 + 1,5%)
  txUpdateMany.mockResolvedValue({ count: 1 }); // transicao PROCESSING_FEE ok
  walletFindUnique.mockResolvedValue({ masterAddress: "lq1real" });
  repaymentUpsert.mockResolvedValue({ id: REPAYMENT_ID, status: "PENDING" });
  repaymentUpdate.mockResolvedValue({});
  repaymentUpdateMany.mockResolvedValue({ count: 1 });
  ledgerUpsert.mockResolvedValue({});
  // applyDepositBusinessEffects: early-return (status != COMPLETED no read).
  txFindUnique.mockResolvedValue({ id: TX_ID, status: "PROCESSING_FEE" });
});

describe("settleDepositViaFeeWallet", () => {
  it("repassa o LIQUIDO da carteira de taxas com idempotencyKey repay:{id}", async () => {
    transfer.mockResolvedValue({ success: true, txid: "repay-txid" });

    const res = await settleDepositViaFeeWallet(args);

    expect(res).toMatchObject({ matched: true, completed: true });
    // Transfer a partir da CARTEIRA DE TAXAS (nao do tenant real).
    expect(transfer.mock.calls[0]![0]).toBe(FEE_TENANT);
    // Liquido = 100 - (0,99 + 1,5%) = 100 - 2,49 = 97,51.
    const recipients = transfer.mock.calls[0]![1] as Array<{ to: string; amountBrl: number }>;
    expect(recipients[0]!.to).toBe("lq1real");
    expect(recipients[0]!.amountBrl).toBeCloseTo(97.51, 2);
    // Idempotencia estavel por repayment.
    expect(transfer.mock.calls[0]![2]).toMatchObject({ idempotencyKey: `repay:${REPAYMENT_ID}` });
    // Ledger SETTLED registrado (taxa retida).
    expect(ledgerUpsert).toHaveBeenCalled();
  });

  it("race: transicao count=0 -> alreadyCompleted, sem transferir", async () => {
    txUpdateMany.mockResolvedValueOnce({ count: 0 });

    const res = await settleDepositViaFeeWallet(args);
    expect(res).toMatchObject({ alreadyCompleted: true });
    expect(transfer).not.toHaveBeenCalled();
  });

  it("falha no transfer -> repayment PENDING (attempts++), nao completa", async () => {
    transfer.mockResolvedValue({ success: false, error: "insufficient_lbtc" });

    const res = await settleDepositViaFeeWallet(args);
    expect(res).toMatchObject({ repayPending: true });
    // Incrementa tentativas e grava o erro; nao marca COMPLETED.
    expect(repaymentUpdate).toHaveBeenCalled();
    const upd = repaymentUpdate.mock.calls[0]![0] as { data: { attempts: unknown } };
    expect(upd.data.attempts).toEqual({ increment: 1 });
    expect(repaymentUpdateMany).not.toHaveBeenCalled(); // nao completou
  });

  it("tx nao encontrada pelo label -> matched:false", async () => {
    txFindFirst.mockResolvedValue(null);
    const res = await settleDepositViaFeeWallet(args);
    expect(res).toMatchObject({ matched: false });
    expect(transfer).not.toHaveBeenCalled();
  });
});
