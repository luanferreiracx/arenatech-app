/**
 * reconcileEulenDepositsByExtract (cron): rede de seguranca por EXTRATO da Eulen
 * (GET /deposits). Cruza o extrato com o banco e age so nas divergencias:
 * `depix_sent` nao-concluido -> reusa checkTransactionStatus; `refunded` ->
 * marca MED_REFUNDED; qrId orfao -> alerta. Banco/Eulen mockados.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const findFirst = vi.fn(); // withAdmin: acha nossa tx pelo pixpayDepixId
const updateMany = vi.fn(); // withAdmin: marca MED_REFUNDED
const txFindUnique = vi.fn(); // withTenant (dentro de checkTransactionStatus)
const txUpdate = vi.fn();
const listEulenDeposits = vi.fn();
const getPixStatus = vi.fn();
const getDepixWithdrawStatus = vi.fn();

const tx = {
  tenantDepixTransaction: {
    findFirst,
    updateMany,
    findUnique: txFindUnique,
    update: txUpdate,
  },
};

vi.mock("@/server/db", () => ({
  withAdmin: (fn: (t: typeof tx) => unknown) => fn(tx),
  withTenant: (_t: string, fn: (t: typeof tx) => unknown) => fn(tx),
}));

vi.mock("@/server/api/trpc", () => ({ CENTRAL_TENANT_SLUG: "arena-tech" }));

vi.mock("@/lib/services/depix-service", () => ({
  listEulenDeposits: (...a: unknown[]) => listEulenDeposits(...a),
  getPixStatus: (...a: unknown[]) => getPixStatus(...a),
  getDepixWithdrawStatus: (...a: unknown[]) => getDepixWithdrawStatus(...a),
  createPixPayment: vi.fn(),
  createDepixWithdraw: vi.fn(),
}));

vi.mock("@/lib/depix/receipt-url", () => ({ extractDepixWithdrawReceiptUrl: () => null }));

const propagateDepositNotPaid = vi.fn();
vi.mock("@/lib/webhooks/depix-deposit-propagate", () => ({
  propagateDepositNotPaid: (...a: unknown[]) => propagateDepositNotPaid(...a),
}));
vi.mock("@/lib/webhooks/verify-deposit-onchain", () => ({ verifyDepositOnChain: vi.fn() }));

import { reconcileEulenDepositsByExtract } from "@/server/services/depix-transaction.service";

const TENANT = "11111111-1111-1111-1111-111111111111";

// Por padrao, o extrato so retorna linha p/ um status (depix_sent); refunded vazio.
function extractReturning(rowsByStatus: Record<string, Array<{ qrId: string }>>) {
  listEulenDeposits.mockImplementation((_s: string, _e: string, status: string) =>
    Promise.resolve({ success: true, rows: rowsByStatus[status] ?? [] }),
  );
}

beforeEach(() => {
  for (const m of [
    findFirst, updateMany, txFindUnique, txUpdate, listEulenDeposits,
    getPixStatus, getDepixWithdrawStatus, propagateDepositNotPaid,
  ]) m.mockReset();
  updateMany.mockResolvedValue({ count: 1 });
  txUpdate.mockResolvedValue({});
  propagateDepositNotPaid.mockResolvedValue(0);
});

describe("reconcileEulenDepositsByExtract", () => {
  it("depix_sent + nossa tx PENDING -> reusa checkTransactionStatus (concilia)", async () => {
    extractReturning({ depix_sent: [{ qrId: "qr-1" }], refunded: [] });
    findFirst.mockResolvedValue({
      id: "tx-1", tenantId: TENANT, status: "PENDING", number: "TXD-1", netAmountCents: 1000,
    });
    // checkTransactionStatus le a tx (DEPOSIT PENDING), depois ela vira COMPLETED.
    txFindUnique
      .mockResolvedValueOnce({
        id: "tx-1", kind: "DEPOSIT", status: "PENDING", pixpayDepixId: "qr-1",
        pixApprovedAt: null, expiresAt: null, depositTxId: null,
      })
      .mockResolvedValue({ id: "tx-1", status: "COMPLETED" });
    getPixStatus.mockResolvedValue({ success: true, status: "expired" }); // forca transicao simples
    txUpdate.mockResolvedValue({ id: "tx-1", status: "EXPIRED" });

    const res = await reconcileEulenDepositsByExtract();
    expect(res).toMatchObject({ scanned: 1, settled: 1, medFlagged: 0, orphans: 0 });
  });

  it("depix_sent + nossa tx ja COMPLETED -> no-op", async () => {
    extractReturning({ depix_sent: [{ qrId: "qr-2" }], refunded: [] });
    findFirst.mockResolvedValue({
      id: "tx-2", tenantId: TENANT, status: "COMPLETED", number: "TXD-2", netAmountCents: 1000,
    });

    const res = await reconcileEulenDepositsByExtract();
    expect(res).toMatchObject({ scanned: 1, settled: 0 });
    // Nao chama checkTransactionStatus (nao le a tx por id).
    expect(txFindUnique).not.toHaveBeenCalled();
  });

  it("refunded + nossa tx nao-MED -> marca MED_REFUNDED + alerta", async () => {
    extractReturning({ depix_sent: [], refunded: [{ qrId: "qr-3" }] });
    findFirst.mockResolvedValue({
      id: "tx-3", tenantId: TENANT, status: "COMPLETED", number: "TXD-3", netAmountCents: 2000,
    });

    const res = await reconcileEulenDepositsByExtract();
    expect(res).toMatchObject({ scanned: 1, medFlagged: 1 });
    const upd = updateMany.mock.calls[0]![0] as { data: { status: string } };
    expect(upd.data.status).toBe("MED_REFUNDED");
  });

  it("refunded + nossa tx ja MED_REFUNDED -> no-op", async () => {
    extractReturning({ depix_sent: [], refunded: [{ qrId: "qr-4" }] });
    findFirst.mockResolvedValue({
      id: "tx-4", tenantId: TENANT, status: "MED_REFUNDED", number: "TXD-4", netAmountCents: 2000,
    });

    const res = await reconcileEulenDepositsByExtract();
    expect(res).toMatchObject({ medFlagged: 0 });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("qrId sem tx nossa -> conta como orfao (nao cria nada)", async () => {
    extractReturning({ depix_sent: [{ qrId: "qr-orphan" }], refunded: [] });
    findFirst.mockResolvedValue(null);

    const res = await reconcileEulenDepositsByExtract();
    expect(res).toMatchObject({ orphans: 1, settled: 0, medFlagged: 0 });
    expect(updateMany).not.toHaveBeenCalled();
    expect(txFindUnique).not.toHaveBeenCalled();
  });

  it("extrato indisponivel (success:false) -> conta erro, nao quebra", async () => {
    listEulenDeposits.mockResolvedValue({ success: false, rows: [], error: "HTTP 500" });

    const res = await reconcileEulenDepositsByExtract();
    // 2 chamadas (depix_sent + refunded), ambas falham.
    expect(res.errors).toBe(2);
    expect(res.scanned).toBe(0);
  });

  it("extrato vazio -> no-op limpo", async () => {
    extractReturning({ depix_sent: [], refunded: [] });
    const res = await reconcileEulenDepositsByExtract();
    expect(res).toMatchObject({ scanned: 0, settled: 0, medFlagged: 0, orphans: 0, errors: 0 });
  });
});
