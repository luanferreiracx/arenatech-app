/**
 * onchainWithdrawSchema: 2ª etapa de confirmacao (re-tipar endereco + valor) e
 * validacao leve de endereco Liquid. O refine roda no SERVIDOR — nao confia so no
 * front.
 */
import { describe, it, expect } from "vitest";
import { onchainWithdrawSchema } from "@/lib/validators/depix-onchain";

const VALID_ADDR =
  "lq1qqw8re6enadhd82hk9m445kr78e7rlddcu58vypmk9ndmm3z9q4nfsxx3qz8q3xjh8qg2k7p7e2pmq4hd2";

const base = {
  toAddress: VALID_ADDR,
  amountReais: 50,
  confirmAddress: VALID_ADDR,
  confirmAmount: 50,
  twoFactorCode: "123456",
};

describe("onchainWithdrawSchema", () => {
  it("aceita endereco/valor confirmados iguais", () => {
    const r = onchainWithdrawSchema.safeParse(base);
    expect(r.success).toBe(true);
  });

  it("rejeita quando o endereco de confirmacao difere", () => {
    const r = onchainWithdrawSchema.safeParse({
      ...base,
      confirmAddress: VALID_ADDR.slice(0, -1) + "x",
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes("confirmAddress"))).toBe(true);
    }
  });

  it("rejeita quando o valor de confirmacao difere", () => {
    const r = onchainWithdrawSchema.safeParse({ ...base, confirmAmount: 49.99 });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes("confirmAmount"))).toBe(true);
    }
  });

  it("rejeita endereco invalido (nao-Liquid)", () => {
    const r = onchainWithdrawSchema.safeParse({
      ...base,
      toAddress: "0xabc123",
      confirmAddress: "0xabc123",
    });
    expect(r.success).toBe(false);
  });

  it("rejeita valor zero ou negativo", () => {
    expect(onchainWithdrawSchema.safeParse({ ...base, amountReais: 0, confirmAmount: 0 }).success).toBe(false);
    expect(onchainWithdrawSchema.safeParse({ ...base, amountReais: -5, confirmAmount: -5 }).success).toBe(false);
  });

  it("exige twoFactorCode", () => {
    const { twoFactorCode: _omit, ...noCode } = base;
    expect(onchainWithdrawSchema.safeParse(noCode).success).toBe(false);
  });

  it("trata espacos: confirmacao com espacos ao redor confere", () => {
    const r = onchainWithdrawSchema.safeParse({ ...base, confirmAddress: `  ${VALID_ADDR}  ` });
    expect(r.success).toBe(true);
  });
});
