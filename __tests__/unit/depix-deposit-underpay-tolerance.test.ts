/**
 * depositUnderpayToleranceCents: quanto o on-chain de um deposito pode chegar
 * ABAIXO do bruto e ainda ser legitimo no cross-check. Com o SPLIT NATIVO, a Eulen
 * manda o LIQUIDO (bruto − taxa Arena − taxa fixa Eulen), entao a folga precisa
 * cobrir a taxa Arena esperada + a fixa da Eulen — nao so 99c (bug: deposito com
 * taxa percentual acima de ~R$40 ficava preso em PROCESSING). Banco mockado.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const tenantFindUnique = vi.fn(); // getCentralTenantId
const feeConfigFindUnique = vi.fn(); // loadFeeConfig

const tx = {
  tenant: { findUnique: tenantFindUnique },
  tenantDepixFeeConfig: { findUnique: feeConfigFindUnique },
};

vi.mock("@/server/db", () => ({
  withAdmin: (fn: (t: typeof tx) => unknown) => fn(tx),
  withTenant: (_t: string, fn: (t: typeof tx) => unknown) => fn(tx),
}));
vi.mock("@/server/api/trpc", () => ({ CENTRAL_TENANT_SLUG: "arena-tech" }));
// A service importa estes; mockados p/ importar limpo (nao usados por este helper).
vi.mock("@/lib/services/depix-service", () => ({
  getPixStatus: vi.fn(),
  getDepixWithdrawStatus: vi.fn(),
  createPixPayment: vi.fn(),
  createDepixWithdraw: vi.fn(),
  listEulenDeposits: vi.fn(),
}));
vi.mock("@/lib/depix/receipt-url", () => ({ extractDepixWithdrawReceiptUrl: () => null }));
vi.mock("@/lib/webhooks/depix-deposit-propagate", () => ({ propagateDepositNotPaid: vi.fn() }));
vi.mock("@/server/services/depix-fee-wallet.service", () => ({ getFeeWalletTenantId: vi.fn() }));
// Mantem a taxa fixa Eulen real (99c) usada pelo helper.
vi.mock("@/lib/webhooks/verify-deposit-onchain", () => ({
  verifyDepositOnChain: vi.fn(),
  EULEN_DEPOSIT_FEE_CENTS: 99,
}));

import { depositUnderpayToleranceCents } from "@/server/services/depix-transaction.service";

const CENTRAL = "central-id";
const LOJA = "22222222-2222-2222-2222-222222222222";

beforeEach(() => {
  tenantFindUnique.mockReset();
  feeConfigFindUnique.mockReset();
  tenantFindUnique.mockResolvedValue({ id: CENTRAL });
});

describe("depositUnderpayToleranceCents", () => {
  it("tenant central (ZERO_FEE): volta a ~99c (comportamento inalterado)", async () => {
    // central: sem split. folga = 0 (Arena) + 99 (Eulen) + 2 (buffer).
    const tol = await depositUnderpayToleranceCents(CENTRAL, 50_000);
    expect(tol).toBe(101);
    // nem consultou config de taxa (guard do central).
    expect(feeConfigFindUnique).not.toHaveBeenCalled();
  });

  it("loja nao-central com taxa default (99c + 1,5%): cobre a taxa Arena + Eulen", async () => {
    feeConfigFindUnique.mockResolvedValue(null); // defaults: fixo 99c + 1,5%
    // Bruto R$100 (10000c): split% = (99 + 150)/10000 = 2,49% -> Arena 249c.
    // folga = 249 + 99 + 2 = 350.
    const tol = await depositUnderpayToleranceCents(LOJA, 10_000);
    expect(tol).toBe(350);
  });

  it("loja com taxa maior escala com o valor (protege depositos grandes)", async () => {
    feeConfigFindUnique.mockResolvedValue({ entryFeeFixed: 99, entryFeePercent: 2 });
    // Bruto R$1.000 (100000c): split% = (99 + 2000)/100000 = 2,10% (2 casas).
    // Arena = round(100000 * 2,10/100) = 2100. folga = 2100 + 99 + 2 = 2201.
    const tol = await depositUnderpayToleranceCents(LOJA, 100_000);
    expect(tol).toBe(2201);
  });

  it("bruto <= 0: retorna a folga minima (fixa Eulen + buffer) sem consultar taxa", async () => {
    const tol = await depositUnderpayToleranceCents(LOJA, 0);
    expect(tol).toBe(101);
    expect(feeConfigFindUnique).not.toHaveBeenCalled();
  });
});
