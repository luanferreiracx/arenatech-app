/**
 * createDeposit com SPLIT NATIVO da Eulen: o DePix cai SEMPRE na carteira do
 * proprio tenant (custodial e non-custodial); a taxa Arena e descontada na origem
 * via depixSplitAddress + splitFee. Central e isento (sem split). Tudo mockado.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const txCreate = vi.fn();
const txUpdate = vi.fn();
const txFindFirst = vi.fn(); // nextTransactionNumber
const feeConfigFindUnique = vi.fn();
const walletFindUnique = vi.fn(); // master da Arena (getArenaMasterAddress)
const tenantFindUnique = vi.fn(); // getCentralTenantId / arena-tech slug
const generateAddress = vi.fn();
const createPixPayment = vi.fn();
const getFeeWalletTenantId = vi.fn();
const getFeeWalletMasterAddress = vi.fn();

const adminTx = {
  tenant: { findUnique: tenantFindUnique },
  tenantDepixWallet: { findUnique: walletFindUnique },
};

vi.mock("@/server/db", () => ({
  withTenant: (_tenantId: string, fn: (tx: unknown) => unknown) =>
    fn({
      tenantDepixTransaction: {
        findFirst: txFindFirst,
        create: txCreate,
        update: txUpdate,
      },
      tenantDepixFeeConfig: { findUnique: feeConfigFindUnique },
      tenant: { findUnique: tenantFindUnique },
    }),
  withAdmin: (fn: (tx: unknown) => unknown) => fn(adminTx),
}));

vi.mock("@/server/api/trpc", () => ({ CENTRAL_TENANT_SLUG: "arena-tech" }));

vi.mock("@/lib/services/lwk-service", () => ({
  generateAddress: (...a: unknown[]) => generateAddress(...a),
}));

vi.mock("@/lib/services/depix-service", () => ({
  createPixPayment: (...a: unknown[]) => createPixPayment(...a),
  createDepixWithdraw: vi.fn(),
  getPixStatus: vi.fn(),
  getDepixWithdrawStatus: vi.fn(),
  listEulenDeposits: vi.fn(),
}));

vi.mock("@/server/services/depix-fee-wallet.service", () => ({
  getFeeWalletTenantId: (...a: unknown[]) => getFeeWalletTenantId(...a),
  getFeeWalletMasterAddress: (...a: unknown[]) => getFeeWalletMasterAddress(...a),
}));

import { createDeposit } from "@/server/services/depix-transaction.service";

const REAL_TENANT = "11111111-1111-1111-1111-111111111111";
const CENTRAL_TENANT = "99999999-9999-9999-9999-999999999999";
const TX_ID = "33333333-3333-3333-3333-333333333333";
// Master da CARTEIRA DE TAXAS (arena-fees) — destino do split desde a separacao.
const FEE_MASTER = "lq1feewalletmaster";

const baseArgs = {
  tenantId: REAL_TENANT,
  grossAmountCents: 10000, // R$100
  userId: "44444444-4444-4444-4444-444444444444",
};

beforeEach(() => {
  for (const m of [
    txCreate, txUpdate, txFindFirst, feeConfigFindUnique, walletFindUnique,
    tenantFindUnique, generateAddress, createPixPayment, getFeeWalletTenantId,
    getFeeWalletMasterAddress,
  ]) m.mockReset();

  txFindFirst.mockResolvedValue(null);
  txCreate.mockResolvedValue({ id: TX_ID, number: "TXD20260616-00001" });
  txUpdate.mockImplementation(async (a: { data: unknown }) => a.data);
  feeConfigFindUnique.mockResolvedValue(null); // defaults (R$0,99 + 1,5%)
  // getCentralTenantId -> arena-tech = CENTRAL_TENANT.
  tenantFindUnique.mockResolvedValue({ id: CENTRAL_TENANT });
  walletFindUnique.mockResolvedValue({ masterAddress: "lq1unused" });
  // Split address = master da CARTEIRA DE TAXAS.
  getFeeWalletMasterAddress.mockResolvedValue(FEE_MASTER);
  generateAddress.mockResolvedValue({ success: true, address: "lq1tenantaddr", label: "x" });
  createPixPayment.mockResolvedValue({
    success: true,
    transactionId: "pix-1",
    qrCode: "qr",
    qrCodeBase64: "b64",
  });
});

describe("createDeposit — split nativo Eulen", () => {
  it("tenant normal: recebe na PROPRIA carteira + manda split (taxa -> arena master)", async () => {
    await createDeposit(baseArgs);

    // Endereco gerado na carteira do PROPRIO tenant.
    expect(generateAddress).toHaveBeenCalledWith(REAL_TENANT, TX_ID);
    // PixPay aponta pro endereco do tenant + split p/ a Arena (2,49% em R$100).
    const opts = createPixPayment.mock.calls[0]![4] as {
      depixAddress: string;
      depixSplitAddress?: string;
      splitFeePercent?: number;
    };
    expect(opts.depixAddress).toBe("lq1tenantaddr");
    expect(opts.depixSplitAddress).toBe(FEE_MASTER);
    expect(opts.splitFeePercent).toBeCloseTo(2.49, 2);
    // depositReceivingTenantId = o proprio tenant (sem carteira de taxas).
    const persisted = txUpdate.mock.calls.at(-1)![0] as { data: { depositReceivingTenantId: string } };
    expect(persisted.data.depositReceivingTenantId).toBe(REAL_TENANT);
  });

  it("non-custodial tambem usa split (sem carteira de taxas)", async () => {
    // O custodyModel nao muda mais o roteamento — ambos recebem na propria carteira.
    await createDeposit(baseArgs);
    expect(generateAddress).toHaveBeenCalledWith(REAL_TENANT, TX_ID);
    expect(getFeeWalletTenantId).not.toHaveBeenCalled();
    const opts = createPixPayment.mock.calls[0]![4] as { depixSplitAddress?: string };
    expect(opts.depixSplitAddress).toBe(FEE_MASTER);
  });

  it("tenant central: SEM split (taxa 0, recebe 100%)", async () => {
    // O deposito e do PROPRIO tenant central (id = CENTRAL_TENANT, que e o que
    // getCentralTenantId resolve). loadFeeConfig retorna ZERO -> sem split.
    await createDeposit({ ...baseArgs, tenantId: CENTRAL_TENANT });

    const opts = createPixPayment.mock.calls[0]![4] as {
      depixSplitAddress?: string;
      splitFeePercent?: number;
    };
    expect(opts.depixSplitAddress).toBeUndefined();
    expect(opts.splitFeePercent).toBe(0);
  });
});
