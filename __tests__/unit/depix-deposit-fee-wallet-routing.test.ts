/**
 * Roteamento do endereco de deposito (ADR 0052, PR3): tenant non-custodial
 * recebe o DePix na CARTEIRA DE TAXAS (arena-fees); custodial recebe na propria.
 * Fail-closed se a carteira de taxas nao existe. Tudo mockado — testa a logica
 * de roteamento do createDeposit, nao o banco/LWK/PixPay.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const txCreate = vi.fn();
const txUpdate = vi.fn();
const txFindFirst = vi.fn(); // nextTransactionNumber
const walletFindUnique = vi.fn(); // custodyModel do tenant
const generateAddress = vi.fn();
const createPixPayment = vi.fn();
const getFeeWalletTenantId = vi.fn();

vi.mock("@/server/db", () => ({
  withTenant: (_tenantId: string, fn: (tx: unknown) => unknown) =>
    fn({
      tenantDepixTransaction: {
        findFirst: txFindFirst,
        create: txCreate,
        update: txUpdate,
      },
      tenantDepixWallet: { findUnique: walletFindUnique },
    }),
  withAdmin: (fn: (tx: unknown) => unknown) => fn({}),
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
}));

vi.mock("@/server/services/depix-fee-wallet.service", () => ({
  getFeeWalletTenantId: (...a: unknown[]) => getFeeWalletTenantId(...a),
}));

import { createDeposit } from "@/server/services/depix-transaction.service";

const REAL_TENANT = "11111111-1111-1111-1111-111111111111";
const FEE_TENANT = "22222222-2222-2222-2222-222222222222";
const TX_ID = "33333333-3333-3333-3333-333333333333";

const baseArgs = {
  tenantId: REAL_TENANT,
  grossAmountCents: 10000,
  userId: "44444444-4444-4444-4444-444444444444",
};

beforeEach(() => {
  txCreate.mockReset();
  txUpdate.mockReset();
  txFindFirst.mockReset();
  walletFindUnique.mockReset();
  generateAddress.mockReset();
  createPixPayment.mockReset();
  getFeeWalletTenantId.mockReset();

  txFindFirst.mockResolvedValue(null); // primeira tx do dia
  txCreate.mockResolvedValue({ id: TX_ID, number: "TXD20260616-00001" });
  txUpdate.mockImplementation(async (a: { data: unknown }) => a.data);
  generateAddress.mockResolvedValue({ success: true, address: "lq1addr", label: "x" });
  createPixPayment.mockResolvedValue({
    success: true,
    transactionId: "pix-1",
    qrCode: "qr",
    qrCodeBase64: "b64",
  });
});

describe("createDeposit — roteamento da carteira de recebimento", () => {
  it("non-custodial: gera endereco na CARTEIRA DE TAXAS e persiste o destino", async () => {
    walletFindUnique.mockResolvedValue({ custodyModel: "non_custodial" });
    getFeeWalletTenantId.mockResolvedValue(FEE_TENANT);

    await createDeposit(baseArgs);

    // Endereco gerado na carteira de taxas, NAO no tenant real.
    expect(generateAddress).toHaveBeenCalledWith(FEE_TENANT, TX_ID);
    // PixPay aponta pro endereco da carteira de taxas.
    expect(createPixPayment.mock.calls[0]![4]).toMatchObject({ depixAddress: "lq1addr" });
    // Persiste depositReceivingTenantId = carteira de taxas.
    const persisted = txUpdate.mock.calls.at(-1)![0] as { data: { depositReceivingTenantId: string } };
    expect(persisted.data.depositReceivingTenantId).toBe(FEE_TENANT);
  });

  it("custodial: gera endereco na PROPRIA carteira do tenant", async () => {
    walletFindUnique.mockResolvedValue({ custodyModel: "custodial" });

    await createDeposit(baseArgs);

    expect(generateAddress).toHaveBeenCalledWith(REAL_TENANT, TX_ID);
    expect(getFeeWalletTenantId).not.toHaveBeenCalled();
    const persisted = txUpdate.mock.calls.at(-1)![0] as { data: { depositReceivingTenantId: string } };
    expect(persisted.data.depositReceivingTenantId).toBe(REAL_TENANT);
  });

  it("fail-closed: non-custodial sem carteira de taxas -> erro + tx FAILED", async () => {
    walletFindUnique.mockResolvedValue({ custodyModel: "non_custodial" });
    getFeeWalletTenantId.mockResolvedValue(null);

    await expect(createDeposit(baseArgs)).rejects.toThrow(/Carteira de taxas/i);
    // NAO gera endereco nem chama PixPay (bloqueia antes).
    expect(generateAddress).not.toHaveBeenCalled();
    expect(createPixPayment).not.toHaveBeenCalled();
    // Marca a tx como FAILED.
    const failed = txUpdate.mock.calls.find(
      (c) => (c[0] as { data: { status?: string } }).data.status === "FAILED",
    );
    expect(failed).toBeTruthy();
  });
});
