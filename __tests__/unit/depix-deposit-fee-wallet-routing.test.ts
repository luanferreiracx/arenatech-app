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
const depositWalletFindUnique = vi.fn(); // custodyModel do tenant (roteamento external)
const tenantFindUnique = vi.fn(); // getCentralTenantId / arena-tech slug
const generateAddress = vi.fn();
const createPixPayment = vi.fn();
const getFeeWalletTenantId = vi.fn();
const getFeeWalletMasterAddress = vi.fn();
const assertAddressAllowedMock = vi.fn();
const getPrimaryByowAddressMock = vi.fn();

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
      tenantDepixWallet: { findUnique: depositWalletFindUnique },
      tenant: { findUnique: tenantFindUnique },
    }),
  withAdmin: (fn: (tx: unknown) => unknown) => fn(adminTx),
}));

vi.mock("@/server/api/trpc", () => ({ CENTRAL_TENANT_SLUG: "arena-tech" }));

// Allowlist BYOW: importada dinamicamente pelo createDeposit (barreira + endereço
// primário do modo externo). Mockada para controlar o roteamento sem tocar no DB.
vi.mock("@/server/services/depix-byow.service", () => ({
  assertAddressAllowed: (...a: unknown[]) => assertAddressAllowedMock(...a),
  getPrimaryByowAddress: (...a: unknown[]) => getPrimaryByowAddressMock(...a),
}));

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

import { Prisma } from "@prisma/client";
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
    depositWalletFindUnique, tenantFindUnique, generateAddress, createPixPayment,
    getFeeWalletTenantId, getFeeWalletMasterAddress, assertAddressAllowedMock,
    getPrimaryByowAddressMock,
  ]) m.mockReset();

  // Default: tenant gerenciado (custodyModel != external) -> caminho LWK atual.
  depositWalletFindUnique.mockResolvedValue({ custodyModel: "non_custodial" });
  assertAddressAllowedMock.mockResolvedValue(undefined);
  getPrimaryByowAddressMock.mockResolvedValue(null);
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

  it("carteira EXTERNAL: roteia pro endereço primário da allowlist (sem LWK) + mantém split", async () => {
    const EXTERNAL_ADDR = "lq1qqexternaldestaddr00000000000000000000";
    depositWalletFindUnique.mockResolvedValue({ custodyModel: "external" });
    getPrimaryByowAddressMock.mockResolvedValue(EXTERNAL_ADDR);

    await createDeposit(baseArgs);

    // Resolveu o endereço próprio e NÃO gerou endereço LWK (a Arena não custodia).
    expect(getPrimaryByowAddressMock).toHaveBeenCalledWith(REAL_TENANT);
    expect(generateAddress).not.toHaveBeenCalled();
    // Revalidou o endereço na allowlist (barreira anti-desvio).
    expect(assertAddressAllowedMock).toHaveBeenCalledWith(REAL_TENANT, EXTERNAL_ADDR, expect.anything());
    // PixPay aponta pro endereço EXTERNO do tenant, ainda com split (Arena ganha).
    const opts = createPixPayment.mock.calls[0]![4] as {
      depixAddress: string;
      depixSplitAddress?: string;
      splitFeePercent?: number;
    };
    expect(opts.depixAddress).toBe(EXTERNAL_ADDR);
    expect(opts.depixSplitAddress).toBe(FEE_MASTER);
    expect(opts.splitFeePercent).toBeCloseTo(2.49, 2);
    // isByow: sem label/receiving do monitor LWK.
    const persisted = txUpdate.mock.calls.at(-1)![0] as {
      data: { depositReceivingTenantId: string | null; depositLabel: string | null };
    };
    expect(persisted.data.depositReceivingTenantId).toBeNull();
    expect(persisted.data.depositLabel).toBeNull();
  });

  it("carteira EXTERNAL sem endereço cadastrado: recusa (não gera QR)", async () => {
    depositWalletFindUnique.mockResolvedValue({ custodyModel: "external" });
    getPrimaryByowAddressMock.mockResolvedValue(null);

    await expect(createDeposit(baseArgs)).rejects.toThrow(/endereco de recebimento|endereço de recebimento/i);
    expect(createPixPayment).not.toHaveBeenCalled();
    expect(generateAddress).not.toHaveBeenCalled();
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

describe("createDeposit — idempotência (API de parceiros)", () => {
  const EXISTING = { id: "existing-tx", number: "TXD20260616-09999", status: "PENDING" };

  it("idempotencyKey ja existente: retorna o MESMO deposito sem gerar QR novo", async () => {
    // Pre-check encontra a transacao -> retorna sem chamar LWK/PixPay.
    txFindFirst.mockResolvedValueOnce(EXISTING);
    const res = await createDeposit({ ...baseArgs, idempotencyKey: "idem-1" });

    expect(res).toBe(EXISTING);
    expect(generateAddress).not.toHaveBeenCalled();
    expect(createPixPayment).not.toHaveBeenCalled();
    expect(txCreate).not.toHaveBeenCalled();
  });

  it("corrida concorrente (P2002): recupera o deposito ja criado", async () => {
    // Pre-check perde (null), nextTransactionNumber (null), create colide (P2002),
    // recovery encontra a transacao criada pela chamada vencedora.
    txFindFirst
      .mockResolvedValueOnce(null) // pre-check
      .mockResolvedValueOnce(null) // nextTransactionNumber
      .mockResolvedValueOnce(EXISTING); // recovery pos-P2002
    txCreate.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("unique", { code: "P2002", clientVersion: "7" }),
    );

    const res = await createDeposit({ ...baseArgs, idempotencyKey: "idem-2" });
    expect(res).toBe(EXISTING);
    expect(createPixPayment).not.toHaveBeenCalled();
  });

  it("sem idempotencyKey: nao faz pre-check de idempotencia", async () => {
    await createDeposit(baseArgs);
    // findFirst so foi chamado pra numeracao — nunca com filtro idempotencyKey.
    for (const call of txFindFirst.mock.calls) {
      const where = (call[0] as { where?: Record<string, unknown> } | undefined)?.where ?? {};
      expect(where).not.toHaveProperty("idempotencyKey");
    }
  });
});
