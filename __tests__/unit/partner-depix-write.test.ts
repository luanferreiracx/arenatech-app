/**
 * partner-depix-write.service (ADR 0057, Fase 3): criar depósito + sacar via API.
 * Garante: saque só em carteira CUSTODIAL, cap diário PRÓPRIO da API, atribuição a
 * um membro do tenant, e roteamento PIX/on-chain. Services internos mockados.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const createDeposit = vi.fn();
const createWithdraw = vi.fn();
const createOnchainWithdraw = vi.fn();
const userTenantFindFirst = vi.fn();
const walletFindUnique = vi.fn();
const txAggregate = vi.fn();

const adminTx = {
  userTenant: { findFirst: userTenantFindFirst },
  tenantDepixWallet: { findUnique: walletFindUnique },
  tenantDepixTransaction: { aggregate: txAggregate },
};

vi.mock("@/server/db", () => ({
  withAdmin: (fn: (t: typeof adminTx) => unknown) => fn(adminTx),
}));
vi.mock("@/server/services/depix-transaction.service", () => ({
  createDeposit: (...a: unknown[]) => createDeposit(...a),
  createWithdraw: (...a: unknown[]) => createWithdraw(...a),
  createOnchainWithdraw: (...a: unknown[]) => createOnchainWithdraw(...a),
}));

import {
  partnerCreateDeposit,
  partnerCreateWithdraw,
} from "@/server/services/partner-depix-write.service";

const TENANT = "11111111-1111-1111-1111-111111111111";
const ADDR = "lq1qqexternaldestaddr00000000000000000000";

beforeEach(() => {
  for (const m of [createDeposit, createWithdraw, createOnchainWithdraw, userTenantFindFirst, walletFindUnique, txAggregate]) m.mockReset();
  userTenantFindFirst.mockResolvedValue({ userId: "member-1" });
  walletFindUnique.mockResolvedValue({ custodyModel: "custodial" });
  txAggregate.mockResolvedValue({ _sum: { grossAmountCents: 0 } });
});

describe("partnerCreateDeposit", () => {
  it("cria depósito atribuído a um membro do tenant e retorna o QR", async () => {
    createDeposit.mockResolvedValue({
      id: "tx-1", number: "TXD-1", status: "PENDING", grossAmountCents: 10000,
      qrCode: "00020...", qrCodeBase64: "b64",
    });
    const res = await partnerCreateDeposit({
      tenantId: TENANT, keyPrefix: "abcd1234",
      input: { amountCents: 10000, payerTaxId: "12345678909", description: null },
    });
    expect(createDeposit.mock.calls[0]![0]).toMatchObject({
      tenantId: TENANT, userId: "member-1", grossAmountCents: 10000, payerTaxId: "12345678909",
    });
    expect(res).toMatchObject({ id: "tx-1", qrCode: "00020...", status: "PENDING" });
  });

  it("tenant sem membro -> PRECONDITION_FAILED", async () => {
    userTenantFindFirst.mockResolvedValue(null);
    await expect(
      partnerCreateDeposit({ tenantId: TENANT, keyPrefix: "k", input: { amountCents: 2000, payerTaxId: "12345678909", description: null } }),
    ).rejects.toThrow(/usuário vinculado/i);
  });
});

describe("partnerCreateWithdraw", () => {
  it("BLOQUEIA saque em carteira non-custodial (exige passphrase humana)", async () => {
    walletFindUnique.mockResolvedValue({ custodyModel: "non_custodial" });
    await expect(
      partnerCreateWithdraw({
        tenantId: TENANT, keyPrefix: "k",
        input: { method: "onchain", amountCents: 5000, toAddress: ADDR },
      }),
    ).rejects.toThrow(/non-custodial/i);
    expect(createOnchainWithdraw).not.toHaveBeenCalled();
  });

  it("aplica o cap diário PRÓPRIO da API (barra acima do limite)", async () => {
    // Já usou R$9.999 nas 24h; default do cap API = R$10.000. +R$50 estoura.
    txAggregate.mockResolvedValue({ _sum: { grossAmountCents: 999900 } });
    await expect(
      partnerCreateWithdraw({
        tenantId: TENANT, keyPrefix: "k",
        input: { method: "onchain", amountCents: 5000, toAddress: ADDR },
      }),
    ).rejects.toThrow(/cap diário de saque via api/i);
    expect(createOnchainWithdraw).not.toHaveBeenCalled();
  });

  it("on-chain: chama createOnchainWithdraw e retorna o txid", async () => {
    createOnchainWithdraw.mockResolvedValue({
      id: "txw-1", number: "TXW-1", status: "COMPLETED", netAmountCents: 5000, withdrawTxId: "liquid-x",
    });
    const res = await partnerCreateWithdraw({
      tenantId: TENANT, keyPrefix: "abcd1234",
      input: { method: "onchain", amountCents: 5000, toAddress: ADDR },
    });
    expect(createOnchainWithdraw.mock.calls[0]![0]).toMatchObject({ tenantId: TENANT, userId: "member-1", toAddress: ADDR });
    expect(res).toMatchObject({ method: "onchain", onchainTxId: "liquid-x", status: "COMPLETED" });
  });

  it("pix: chama createWithdraw (sem 2FA) e retorna", async () => {
    createWithdraw.mockResolvedValue({ id: "txw-2", number: "TXW-2", status: "PROCESSING", netAmountCents: 3000, withdrawTxId: null });
    const res = await partnerCreateWithdraw({
      tenantId: TENANT, keyPrefix: "k",
      input: { method: "pix", amountCents: 3000, pixKeyType: "CPF", pixKey: "12345678909", recipientName: null, recipientTaxId: "12345678909" },
    });
    expect(createWithdraw).toHaveBeenCalled();
    // Nao passa twoFactorCode (parceiro nao tem 2FA).
    expect(createWithdraw.mock.calls[0]![0]).not.toHaveProperty("twoFactorCode");
    expect(res).toMatchObject({ method: "pix", status: "PROCESSING" });
  });
});
