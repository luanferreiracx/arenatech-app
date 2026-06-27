/**
 * onchainWithdrawSchema: o usuario COLA o endereco e CONFERE (acknowledgedAddress),
 * sem re-digitar. Valida endereco Liquid leve + exige o ack + 2FA.
 */
import { describe, it, expect } from "vitest";
import { onchainWithdrawSchema } from "@/lib/validators/depix-onchain";

const VALID_ADDR =
  "lq1qqw8re6enadhd82hk9m445kr78e7rlddcu58vypmk9ndmm3z9q4nfsxx3qz8q3xjh8qg2k7p7e2pmq4hd2";

const base = {
  toAddress: VALID_ADDR,
  amountReais: 50,
  acknowledgedAddress: true as const,
  twoFactorCode: "123456",
};

describe("onchainWithdrawSchema", () => {
  it("aceita endereco colado + conferido", () => {
    expect(onchainWithdrawSchema.safeParse(base).success).toBe(true);
  });

  it("rejeita sem o ack de conferencia (acknowledgedAddress != true)", () => {
    const r = onchainWithdrawSchema.safeParse({ ...base, acknowledgedAddress: false });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes("acknowledgedAddress"))).toBe(true);
    }
  });

  it("rejeita endereco invalido (nao-Liquid)", () => {
    expect(onchainWithdrawSchema.safeParse({ ...base, toAddress: "0xabc123" }).success).toBe(false);
  });

  it("rejeita valor zero ou negativo", () => {
    expect(onchainWithdrawSchema.safeParse({ ...base, amountReais: 0 }).success).toBe(false);
    expect(onchainWithdrawSchema.safeParse({ ...base, amountReais: -5 }).success).toBe(false);
  });

  it("exige twoFactorCode", () => {
    const { twoFactorCode: _omit, ...noCode } = base;
    expect(onchainWithdrawSchema.safeParse(noCode).success).toBe(false);
  });

  it("aceita endereco com espacos ao redor (trim)", () => {
    expect(onchainWithdrawSchema.safeParse({ ...base, toAddress: `  ${VALID_ADDR}  ` }).success).toBe(true);
  });
});
