/**
 * settleDepositConfirmed com SPLIT NATIVO: o on-chain que chega JA e o liquido (a
 * Eulen separou a taxa na origem). Logo NAO ha lwk.transfer de taxa — vai direto
 * PENDING/PROCESSING -> COMPLETED, registra o ledger Arena SETTLED via split
 * (settlementTxId = txid do deposito). Banco/LWK mockados.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const txFindFirst = vi.fn();
const txUpdateMany = vi.fn();
const txFindUnique = vi.fn(); // applyDepositBusinessEffects (early-return)
const feeConfigFindUnique = vi.fn();
const ledgerUpsert = vi.fn();
const tenantFindUnique = vi.fn();
const transfer = vi.fn();

const tx = {
  tenant: { findUnique: tenantFindUnique },
  tenantDepixTransaction: {
    findFirst: txFindFirst,
    updateMany: txUpdateMany,
    findUnique: txFindUnique,
  },
  tenantDepixFeeConfig: { findUnique: feeConfigFindUnique },
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

vi.mock("@/lib/services/depix-service", () => ({
  createPixPayment: vi.fn(),
  createDepixWithdraw: vi.fn(),
  getPixStatus: vi.fn(),
  getDepixWithdrawStatus: vi.fn(),
  listEulenDeposits: vi.fn(),
}));

vi.mock("@/server/services/depix-fee-wallet.service", () => ({
  getFeeWalletTenantId: vi.fn(),
  ensureFeeWalletLbtc: vi.fn(),
}));

import { settleDepositConfirmed } from "@/server/services/depix-transaction.service";

const TENANT = "11111111-1111-1111-1111-111111111111";
const CENTRAL = "99999999-9999-9999-9999-999999999999";
const TX_ID = "33333333-3333-3333-3333-333333333333";

const args = {
  tenantId: TENANT,
  depositLabel: TX_ID,
  depositTxId: "onchain-deadbeef",
  depixAmount: 97.51, // liquido que chegou (R$100 - 2,49%)
  confirmations: 2,
};

beforeEach(() => {
  for (const m of [
    txFindFirst, txUpdateMany, txFindUnique, feeConfigFindUnique,
    ledgerUpsert, tenantFindUnique, transfer,
  ]) m.mockReset();

  tenantFindUnique.mockResolvedValue({ id: CENTRAL }); // tenant real != central
  txFindFirst.mockResolvedValue({ id: TX_ID, tenantId: TENANT, status: "PENDING" });
  feeConfigFindUnique.mockResolvedValue(null); // defaults (R$0,99 + 1,5%)
  txUpdateMany.mockResolvedValue({ count: 1 });
  ledgerUpsert.mockResolvedValue({});
  // applyDepositBusinessEffects: early-return (status != COMPLETED no read).
  txFindUnique.mockResolvedValue({ id: TX_ID, status: "PROCESSING" });
});

describe("settleDepositConfirmed — split nativo (sem transfer de taxa)", () => {
  it("NAO chama lwk.transfer e marca COMPLETED direto", async () => {
    const res = await settleDepositConfirmed(args);

    expect(transfer).not.toHaveBeenCalled();
    expect(res).toMatchObject({ matched: true, completed: true });
    // Transicao PENDING/PROCESSING -> COMPLETED (sem PROCESSING_FEE).
    const upd = txUpdateMany.mock.calls[0]![0] as { data: { status: string; netAmountCents: number } };
    expect(upd.data.status).toBe("COMPLETED");
    // Net = o que chegou (ja liquido pelo split).
    expect(upd.data.netAmountCents).toBe(9751);
  });

  it("registra o ledger Arena SETTLED com settlementTxId = txid do deposito", async () => {
    await settleDepositConfirmed(args);

    expect(ledgerUpsert).toHaveBeenCalled();
    const call = ledgerUpsert.mock.calls[0]![0] as {
      create: { status: string; settlementTxId: string; amountCents: number };
    };
    expect(call.create.status).toBe("SETTLED");
    expect(call.create.settlementTxId).toBe("onchain-deadbeef");
    expect(call.create.amountCents).toBeGreaterThan(0);
  });

  it("count=0 (ja processado) -> alreadyCompleted, sem transfer nem ledger", async () => {
    txUpdateMany.mockResolvedValue({ count: 0 });

    const res = await settleDepositConfirmed(args);
    expect(res).toMatchObject({ matched: true, alreadyCompleted: true });
    expect(transfer).not.toHaveBeenCalled();
    expect(ledgerUpsert).not.toHaveBeenCalled();
  });

  it("tx nao encontrada pelo label -> matched:false", async () => {
    txFindFirst.mockResolvedValue(null);
    const res = await settleDepositConfirmed(args);
    expect(res).toMatchObject({ matched: false });
    expect(transfer).not.toHaveBeenCalled();
  });
});
