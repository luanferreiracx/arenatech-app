/**
 * reconcileStaleDepixTransactions (cron): varre transacoes DePix presas em
 * PENDING/PROCESSING e reusa checkTransactionStatus pra reconciliar. Banco e
 * provedores mockados.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const findMany = vi.fn(); // withAdmin: lista de stale
const txFindUnique = vi.fn(); // withTenant: checkTransactionStatus le a tx
const txUpdate = vi.fn();
const getDepixWithdrawStatus = vi.fn();
const getPixStatus = vi.fn();

const tx = {
  tenantDepixTransaction: { findMany, findUnique: txFindUnique, update: txUpdate },
};

vi.mock("@/server/db", () => ({
  withAdmin: (fn: (t: typeof tx) => unknown) => fn(tx),
  withTenant: (_t: string, fn: (t: typeof tx) => unknown) => fn(tx),
}));

vi.mock("@/server/api/trpc", () => ({ CENTRAL_TENANT_SLUG: "arena-tech" }));

vi.mock("@/lib/services/depix-service", () => ({
  getDepixWithdrawStatus: (...a: unknown[]) => getDepixWithdrawStatus(...a),
  getPixStatus: (...a: unknown[]) => getPixStatus(...a),
  createPixPayment: vi.fn(),
  createDepixWithdraw: vi.fn(),
}));

vi.mock("@/lib/depix/receipt-url", () => ({
  extractDepixWithdrawReceiptUrl: () => null,
}));

const propagateDepositNotPaid = vi.fn();
vi.mock("@/lib/webhooks/depix-deposit-propagate", () => ({
  propagateDepositNotPaid: (...a: unknown[]) => propagateDepositNotPaid(...a),
}));
vi.mock("@/lib/webhooks/verify-deposit-onchain", () => ({ verifyDepositOnChain: vi.fn() }));

import { reconcileStaleDepixTransactions } from "@/server/services/depix-transaction.service";

const TENANT = "11111111-1111-1111-1111-111111111111";

beforeEach(() => {
  for (const m of [findMany, txFindUnique, txUpdate, getDepixWithdrawStatus, getPixStatus, propagateDepositNotPaid]) m.mockReset();
  txUpdate.mockResolvedValue({});
  propagateDepositNotPaid.mockResolvedValue(0);
});

describe("reconcileStaleDepixTransactions", () => {
  it("reconcilia saque 'sent' preso em PROCESSING -> COMPLETED", async () => {
    findMany.mockResolvedValue([
      { id: "tx-1", tenantId: TENANT, status: "PROCESSING" },
    ]);
    // 1a leitura = a tx WITHDRAW (nao-terminal); demais releituras (inclusive do
    // side-effect onWithdrawCompleted, fire-and-forget) = ja COMPLETED.
    txFindUnique.mockResolvedValue({ id: "tx-1", status: "COMPLETED" });
    txFindUnique.mockResolvedValueOnce({
      id: "tx-1",
      kind: "WITHDRAW",
      status: "PROCESSING",
      pixpayDepixId: "lqx-1",
    });
    getDepixWithdrawStatus.mockResolvedValue({ success: true, status: "sent", raw: {} });

    const res = await reconcileStaleDepixTransactions();
    expect(res).toMatchObject({ scanned: 1, reconciled: 1, errors: 0 });
    // Transicionou pra COMPLETED.
    const upd = txUpdate.mock.calls[0]![0] as { data: { status: string } };
    expect(upd.data.status).toBe("COMPLETED");
  });

  it("nao conta como reconciliada quando o status nao muda (ainda processing)", async () => {
    findMany.mockResolvedValue([
      { id: "tx-2", tenantId: TENANT, status: "PROCESSING" },
    ]);
    txFindUnique
      .mockResolvedValueOnce({ id: "tx-2", kind: "WITHDRAW", status: "PROCESSING", pixpayDepixId: "lqx-2" })
      .mockResolvedValueOnce({ id: "tx-2", status: "PROCESSING" });
    getDepixWithdrawStatus.mockResolvedValue({ success: true, status: "processing", raw: {} });

    const res = await reconcileStaleDepixTransactions();
    expect(res).toMatchObject({ scanned: 1, reconciled: 0, unchanged: 1 });
  });

  it("expira deposito PENDING vencido e nao pago -> EXPIRED + propaga QuickSale", async () => {
    findMany.mockResolvedValue([{ id: "dep-x", tenantId: TENANT, status: "PENDING" }]);
    txFindUnique.mockResolvedValueOnce({
      id: "dep-x",
      kind: "DEPOSIT",
      status: "PENDING",
      pixpayDepixId: "qr-x",
      pixApprovedAt: null,
      expiresAt: new Date(Date.now() - 60_000), // vencido ha 1 min
    });
    txUpdate.mockResolvedValue({ id: "dep-x", status: "EXPIRED" });

    const res = await reconcileStaleDepixTransactions();
    expect(res).toMatchObject({ scanned: 1, reconciled: 1, errors: 0 });
    const upd = txUpdate.mock.calls[0]![0] as { data: { status: string } };
    expect(upd.data.status).toBe("EXPIRED");
    expect(propagateDepositNotPaid).toHaveBeenCalledWith("qr-x", "EXPIRED");
    // Nao consulta a Eulen — expira localmente, sem depender do webhook.
    expect(getPixStatus).not.toHaveBeenCalled();
  });

  it("NAO expira deposito vencido se o PIX ja caiu (pixApprovedAt setado)", async () => {
    findMany.mockResolvedValue([{ id: "dep-y", tenantId: TENANT, status: "PENDING" }]);
    txFindUnique.mockResolvedValue({
      id: "dep-y",
      kind: "DEPOSIT",
      status: "PENDING",
      pixpayDepixId: "qr-y",
      pixApprovedAt: new Date(), // PIX recebido — nao expira
      expiresAt: new Date(Date.now() - 60_000),
    });
    getPixStatus.mockResolvedValue({ success: true, status: "pix_received" });

    await reconcileStaleDepixTransactions();
    // Nao marcou EXPIRED.
    const expiredUpd = txUpdate.mock.calls.find(
      (c) => (c[0] as { data?: { status?: string } })?.data?.status === "EXPIRED",
    );
    expect(expiredUpd).toBeUndefined();
    expect(propagateDepositNotPaid).not.toHaveBeenCalled();
  });

  it("lista vazia -> no-op", async () => {
    findMany.mockResolvedValue([]);
    const res = await reconcileStaleDepixTransactions();
    expect(res).toMatchObject({ scanned: 0, reconciled: 0, unchanged: 0, errors: 0, stuckWithdrawals: 0 });
    expect(getDepixWithdrawStatus).not.toHaveBeenCalled();
  });

  it("sinaliza saque preso (PROCESSING ha >1h) sem auto-falhar", async () => {
    const twoHoursAgo = new Date(Date.now() - 120 * 60_000);
    findMany.mockResolvedValue([
      {
        id: "tx-stuck",
        tenantId: TENANT,
        status: "PROCESSING",
        kind: "WITHDRAW",
        number: "TXW-20260626-00001",
        createdAt: twoHoursAgo,
      },
    ]);
    // Continua PROCESSING no provedor (nada a reconciliar).
    txFindUnique
      .mockResolvedValueOnce({ id: "tx-stuck", kind: "WITHDRAW", status: "PROCESSING", pixpayDepixId: "lqx-s" })
      .mockResolvedValueOnce({ id: "tx-stuck", status: "PROCESSING" });
    getDepixWithdrawStatus.mockResolvedValue({ success: true, status: "processing", raw: {} });

    const res = await reconcileStaleDepixTransactions();
    expect(res).toMatchObject({ scanned: 1, reconciled: 0, unchanged: 1, stuckWithdrawals: 1 });
    // NAO auto-falha: nenhum update marcando FAILED.
    const failedUpdate = txUpdate.mock.calls.find(
      (c) => (c[0] as { data?: { status?: string } })?.data?.status === "FAILED",
    );
    expect(failedUpdate).toBeUndefined();
  });

  it("nao sinaliza preso quando o saque acabou de entrar em PROCESSING (<1h)", async () => {
    findMany.mockResolvedValue([
      {
        id: "tx-fresh",
        tenantId: TENANT,
        status: "PROCESSING",
        kind: "WITHDRAW",
        number: "TXW-20260626-00002",
        createdAt: new Date(Date.now() - 5 * 60_000),
      },
    ]);
    txFindUnique
      .mockResolvedValueOnce({ id: "tx-fresh", kind: "WITHDRAW", status: "PROCESSING", pixpayDepixId: "lqx-f" })
      .mockResolvedValueOnce({ id: "tx-fresh", status: "PROCESSING" });
    getDepixWithdrawStatus.mockResolvedValue({ success: true, status: "processing", raw: {} });

    const res = await reconcileStaleDepixTransactions();
    expect(res).toMatchObject({ stuckWithdrawals: 0 });
  });
});
