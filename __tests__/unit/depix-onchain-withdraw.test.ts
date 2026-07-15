/**
 * createOnchainWithdraw (service): saque DePix on-chain p/ endereco Liquid externo.
 * Reusa a secao critica do saque (advisory lock + reserva + cap) e envia via
 * lwk.transfer. Banco/LWK mockados.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const walletFindUnique = vi.fn(); // custodyModel/encryptedSeed
const feeConfigFindUnique = vi.fn();
const aggregate = vi.fn(); // reserva (saques pendentes)
const txCreate = vi.fn();
const txUpdate = vi.fn();
const txFindFirst = vi.fn(); // nextTransactionNumber + idempotencia
const ledgerCreate = vi.fn();
const executeRaw = vi.fn(); // advisory lock
const tenantFindUnique = vi.fn(); // getCentralTenantId

const getBalance = vi.fn();
const transfer = vi.fn();

// O tenant do teste E o central -> loadFeeConfig retorna ZERO_FEE (sem taxa
// Arena, sem getArenaMasterAddress) e o cap diario e isento. Mantem o teste
// focado no fluxo on-chain.
const CENTRAL = "11111111-1111-1111-1111-111111111111";

const tx = {
  tenant: { findUnique: tenantFindUnique },
  tenantDepixWallet: { findUnique: walletFindUnique },
  tenantDepixFeeConfig: { findUnique: feeConfigFindUnique },
  tenantDepixTransaction: {
    aggregate,
    create: txCreate,
    update: txUpdate,
    findFirst: txFindFirst,
  },
  tenantDepixFeeLedger: { create: ledgerCreate },
  $executeRaw: executeRaw,
};

vi.mock("@/server/db", () => ({
  withAdmin: (fn: (t: typeof tx) => unknown) => fn(tx),
  withTenant: (_t: string, fn: (t: typeof tx) => unknown) => fn(tx),
}));

vi.mock("@/server/api/trpc", () => ({ CENTRAL_TENANT_SLUG: "arena-tech" }));

vi.mock("@/lib/services/lwk-service", () => ({
  getBalance: (...a: unknown[]) => getBalance(...a),
  transfer: (...a: unknown[]) => transfer(...a),
  LBTC_ASSET_ID: "lbtc",
}));

vi.mock("@/lib/services/depix-service", () => ({
  createPixPayment: vi.fn(),
  createDepixWithdraw: vi.fn(),
  getPixStatus: vi.fn(),
  getDepixWithdrawStatus: vi.fn(),
  listEulenDeposits: vi.fn(),
}));

vi.mock("@/lib/depix/receipt-url", () => ({ extractDepixWithdrawReceiptUrl: () => null }));
vi.mock("@/lib/webhooks/depix-deposit-propagate", () => ({ propagateDepositNotPaid: vi.fn() }));
vi.mock("@/lib/webhooks/verify-deposit-onchain", () => ({ verifyDepositOnChain: vi.fn() }));

const ensureLbtcFor = vi.fn();
vi.mock("@/server/services/depix-lbtc-refill.service", () => ({
  ensureLbtcFor: (...a: unknown[]) => ensureLbtcFor(...a),
}));

const getFeeWalletMasterAddress = vi.fn();
vi.mock("@/server/services/depix-fee-wallet.service", () => ({
  getFeeWalletMasterAddress: (...a: unknown[]) => getFeeWalletMasterAddress(...a),
  getFeeWalletTenantId: vi.fn(),
}));

import { createOnchainWithdraw } from "@/server/services/depix-transaction.service";

const TENANT = CENTRAL;
const NON_CENTRAL = "55555555-5555-5555-5555-555555555555";
const ADDR = "lq1qqexternaldestaddr00000000000000000000";

beforeEach(() => {
  for (const m of [
    walletFindUnique, feeConfigFindUnique, aggregate, txCreate, txUpdate,
    txFindFirst, ledgerCreate, executeRaw, tenantFindUnique, getBalance, transfer,
    ensureLbtcFor,
    getFeeWalletMasterAddress,
  ]) m.mockReset();
  ensureLbtcFor.mockResolvedValue({ skipped: true });
  getFeeWalletMasterAddress.mockResolvedValue("lq1feewalletmaster");

  // getCentralTenantId resolve p/ o nosso TENANT -> e o central (fee zero, cap isento).
  tenantFindUnique.mockResolvedValue({ id: CENTRAL });
  walletFindUnique.mockResolvedValue({ custodyModel: "custodial", encryptedSeed: null });
  feeConfigFindUnique.mockResolvedValue(null); // defaults
  aggregate.mockResolvedValue({ _sum: { grossAmountCents: 0 } });
  txFindFirst.mockResolvedValue(null); // sem idempotencia previa, sem tx anterior
  executeRaw.mockResolvedValue(1);
  txCreate.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: "txw-1", number: "TXW-1", status: "PENDING", ...data }),
  );
  txUpdate.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: "txw-1", number: "TXW-1", onchainAddress: ADDR, netAmountCents: 5000, grossAmountCents: 5000, ...data }),
  );
  ledgerCreate.mockResolvedValue({});
  // Saldo on-chain folgado.
  getBalance.mockResolvedValue({ success: true, depixBalance: 100 });
});

describe("createOnchainWithdraw", () => {
  it("envia on-chain e marca COMPLETED com withdrawTxId", async () => {
    transfer.mockResolvedValue({ success: true, txid: "liquid-txid-1" });

    const res = await createOnchainWithdraw({
      tenantId: TENANT, userId: "u1", toAddress: ADDR, amountCents: 5000,
    });

    // Lock adquirido antes da criacao.
    expect(executeRaw).toHaveBeenCalled();
    // Transferiu pro endereco externo.
    expect(transfer).toHaveBeenCalled();
    const recipients = transfer.mock.calls[0]![1] as Array<{ to: string }>;
    expect(recipients[0]!.to).toBe(ADDR);
    // idempotencyKey = id da tx (replay nao duplica).
    expect(transfer.mock.calls[0]![2]).toMatchObject({ idempotencyKey: "txw-1" });
    // Final COMPLETED.
    expect(res.status).toBe("COMPLETED");
    const upd = txUpdate.mock.calls.at(-1)![0] as { data: { status: string; withdrawTxId: string } };
    expect(upd.data.status).toBe("COMPLETED");
    expect(upd.data.withdrawTxId).toBe("liquid-txid-1");
  });

  it("carteira EXTERNAL: bloqueia o saque gerenciado (a Arena não custodia)", async () => {
    walletFindUnique.mockResolvedValue({ custodyModel: "external", encryptedSeed: null });

    await expect(
      createOnchainWithdraw({ tenantId: NON_CENTRAL, userId: "u1", toAddress: ADDR, amountCents: 5000 }),
    ).rejects.toThrow(/externa/i);

    // Nunca chega a adquirir lock nem transferir on-chain.
    expect(executeRaw).not.toHaveBeenCalled();
    expect(transfer).not.toHaveBeenCalled();
  });

  it("usa a taxa ON-CHAIN propria (2o output da taxa), nao a do PIX", async () => {
    // Tenant nao-central com taxa on-chain 1% (e exitFee PIX alto, que NAO deve ser usado).
    feeConfigFindUnique.mockResolvedValue({
      entryFeeFixed: 0, entryFeePercent: 0,
      exitFeeFixed: 999, exitFeePercent: 5, // PIX — ignorar
      onchainFeeFixed: 0, onchainFeePercent: 1, // on-chain — usar
    });
    walletFindUnique.mockResolvedValue({
      custodyModel: "custodial", encryptedSeed: null, masterAddress: "lq1feemaster",
    });
    getBalance.mockResolvedValue({ success: true, depixBalance: 200 }); // folga p/ gross R$101
    transfer.mockResolvedValue({ success: true, txid: "liquid-txid-3" });

    await createOnchainWithdraw({
      tenantId: NON_CENTRAL, userId: "u1", toAddress: ADDR, amountCents: 10000, // R$100
    });

    const recipients = transfer.mock.calls[0]![1] as Array<{ to: string; amountBrl: number }>;
    // 2 outputs: destino externo (R$100) + taxa on-chain (1% = R$1) p/ a carteira de taxas.
    expect(recipients).toHaveLength(2);
    expect(recipients[0]).toMatchObject({ to: ADDR, amountBrl: 100 });
    expect(recipients[1]!.amountBrl).toBeCloseTo(1, 2);
  });

  it("seeda L-BTC ANTES do transfer (resolve ovo-e-galinha do 1o saque)", async () => {
    transfer.mockResolvedValue({ success: true, txid: "liquid-txid-2" });
    // Tenant nao-central tem taxa -> resolve arena master (precisa de masterAddress).
    walletFindUnique.mockResolvedValue({
      custodyModel: "custodial",
      encryptedSeed: null,
      masterAddress: "lq1arenamaster",
    });

    await createOnchainWithdraw({
      tenantId: NON_CENTRAL, userId: "u1", toAddress: ADDR, amountCents: 5000,
    });

    // Refill de L-BTC chamado pro tenant ANTES do transfer.
    expect(ensureLbtcFor).toHaveBeenCalledWith(NON_CENTRAL, { source: "auto" });
    const seedOrder = ensureLbtcFor.mock.invocationCallOrder[0]!;
    const transferOrder = transfer.mock.invocationCallOrder[0]!;
    expect(seedOrder).toBeLessThan(transferOrder);
  });

  it("saldo insuficiente -> barra antes de transferir", async () => {
    getBalance.mockResolvedValue({ success: true, depixBalance: 0.1 }); // R$0,10
    await expect(
      createOnchainWithdraw({ tenantId: TENANT, userId: "u1", toAddress: ADDR, amountCents: 5000 }),
    ).rejects.toThrow(/insuficiente/i);
    expect(transfer).not.toHaveBeenCalled();
  });

  it("falha do lwk.transfer -> marca FAILED e lanca", async () => {
    transfer.mockResolvedValue({ success: false, error: "insufficient_depix" });
    await expect(
      createOnchainWithdraw({ tenantId: TENANT, userId: "u1", toAddress: ADDR, amountCents: 5000 }),
    ).rejects.toThrow();
    const failed = txUpdate.mock.calls.find(
      (c) => (c[0] as { data?: { status?: string } })?.data?.status === "FAILED",
    );
    expect(failed).toBeTruthy();
  });

  it("non-custodial sem passphrase -> barra (fail-fast)", async () => {
    walletFindUnique.mockResolvedValue({ custodyModel: "non_custodial", encryptedSeed: "blob" });
    await expect(
      createOnchainWithdraw({ tenantId: TENANT, userId: "u1", toAddress: ADDR, amountCents: 5000 }),
    ).rejects.toThrow(/senha da carteira/i);
    expect(getBalance).not.toHaveBeenCalled();
    expect(transfer).not.toHaveBeenCalled();
  });

  it("LWK indisponivel (getBalance falha) -> SERVICE_UNAVAILABLE", async () => {
    getBalance.mockResolvedValue({ success: false });
    await expect(
      createOnchainWithdraw({ tenantId: TENANT, userId: "u1", toAddress: ADDR, amountCents: 5000 }),
    ).rejects.toThrow(/LWK indisponivel|saldo/i);
    expect(transfer).not.toHaveBeenCalled();
  });
});
