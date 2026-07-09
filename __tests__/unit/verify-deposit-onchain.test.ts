/**
 * verifyDepositOnChain: cross-check on-chain do deposito. Foco no AMOUNT:
 * tolerancia ASSIMETRICA — o on-chain pode ser ate a taxa fixa Eulen (99c) MENOR
 * que o esperado (a Eulen desconta antes de enviar), mas nunca MAIOR (anti-forja).
 * `lwk.listTransactions` mockado.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const listTransactions = vi.fn();
vi.mock("@/lib/services/lwk-service", () => ({
  listTransactions: (...a: unknown[]) => listTransactions(...a),
}));

import { verifyDepositOnChain } from "@/lib/webhooks/verify-deposit-onchain";

const DEPIX_ASSET = "02f22f8d9c76ab41661a2729e4752e2c5d1a263012141b86ea98af5472df5189";

function txWithDepix(txid: string, amount: number, confirmations = 2) {
  return {
    txid,
    confirmations,
    balance: { [DEPIX_ASSET]: { amount, satoshis: Math.round(amount * 1e8), is_depix: true } },
  };
}

beforeEach(() => {
  listTransactions.mockReset();
});

describe("verifyDepositOnChain — tolerancia da taxa Eulen", () => {
  it("aceita on-chain ate 99c MENOR que o esperado (taxa Eulen) — QR estatico", async () => {
    // QR de R$35, on-chain R$34,01 (Eulen tirou 99c). Esperado = valor cheio.
    listTransactions.mockResolvedValue({ success: true, transactions: [txWithDepix("t1", 34.01)] });
    const r = await verifyDepositOnChain({ tenantId: "x", txid: "t1", expectedAmount: 35, expectedAddress: null });
    expect(r.ok).toBe(true);
    expect(r.onchainAmount).toBeCloseTo(34.01, 2);
  });

  it("REJEITA on-chain mais que 1c ACIMA do esperado (anti-forja)", async () => {
    listTransactions.mockResolvedValue({ success: true, transactions: [txWithDepix("t2", 36)] });
    const r = await verifyDepositOnChain({ tenantId: "x", txid: "t2", expectedAmount: 35, expectedAddress: null });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("amount_mismatch");
  });

  it("repassa lwkSync/lwkTimeoutMs ao listTransactions (webhook: sync=false, timeout curto)", async () => {
    listTransactions.mockResolvedValue({ success: true, transactions: [] });
    await verifyDepositOnChain({
      tenantId: "x", txid: "t", expectedAmount: 10, expectedAddress: null,
      lwkTimeoutMs: 8000, lwkSync: false,
    });
    expect(listTransactions).toHaveBeenCalledWith(
      "x", 50, expect.objectContaining({ timeoutMs: 8000, sync: false }),
    );
  });

  it("REJEITA on-chain MUITO abaixo (alem da taxa Eulen)", async () => {
    // R$30 on-chain p/ um esperado de R$35 = R$5 a menos, bem mais que 99c.
    listTransactions.mockResolvedValue({ success: true, transactions: [txWithDepix("t3", 30)] });
    const r = await verifyDepositOnChain({ tenantId: "x", txid: "t3", expectedAmount: 35, expectedAddress: null });
    expect(r.ok).toBe(false);
  });

  it("maxUnderpayCents=0 -> match estrito (deposito normal, valor on-chain real)", async () => {
    listTransactions.mockResolvedValue({ success: true, transactions: [txWithDepix("t4", 34.01)] });
    const r = await verifyDepositOnChain({
      tenantId: "x", txid: "t4", expectedAmount: 35, expectedAddress: null, maxUnderpayCents: 0,
    });
    expect(r.ok).toBe(false); // 99c abaixo NAO e aceito quando estrito
  });

  it("rejeita se < 2 confirmacoes", async () => {
    listTransactions.mockResolvedValue({ success: true, transactions: [txWithDepix("t5", 35, 1)] });
    const r = await verifyDepositOnChain({ tenantId: "x", txid: "t5", expectedAmount: 35, expectedAddress: null });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("insufficient_confirmations");
  });

  it("rejeita se txid nao existe on-chain", async () => {
    listTransactions.mockResolvedValue({ success: true, transactions: [] });
    const r = await verifyDepositOnChain({ tenantId: "x", txid: "nope", expectedAmount: 35, expectedAddress: null });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("txid_not_found_onchain");
  });
});
