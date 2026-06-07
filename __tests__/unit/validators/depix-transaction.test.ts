import { describe, expect, it } from "vitest";
import { createDepositSchema } from "@/lib/validators/depix-transaction";

const validCpf = "52998224725";
const validCnpj = "11222333000181";

describe("createDepositSchema", () => {
  it("accepts R$ 499,99 without payer tax id", () => {
    const result = createDepositSchema.safeParse({ grossAmountCents: 49_999 });

    expect(result.success).toBe(true);
  });

  it("rejects R$ 500,00 without payer tax id", () => {
    const result = createDepositSchema.safeParse({ grossAmountCents: 50_000 });

    expect(result.success).toBe(false);
  });

  it("accepts R$ 500,00 with valid CPF", () => {
    const result = createDepositSchema.safeParse({
      grossAmountCents: 50_000,
      payerTaxId: validCpf,
    });

    expect(result.success).toBe(true);
  });

  it("accepts R$ 500,00 with valid CNPJ", () => {
    const result = createDepositSchema.safeParse({
      grossAmountCents: 50_000,
      payerTaxId: validCnpj,
    });

    expect(result.success).toBe(true);
  });

  it("rejects invalid payer tax id even below R$ 500,00", () => {
    const result = createDepositSchema.safeParse({
      grossAmountCents: 49_999,
      payerTaxId: "11111111111",
    });

    expect(result.success).toBe(false);
  });

  it("accepts max receiving limit R$ 5.000,00", () => {
    const result = createDepositSchema.safeParse({
      grossAmountCents: 500_000,
      payerTaxId: validCpf,
    });

    expect(result.success).toBe(true);
  });

  it("rejects receiving above R$ 5.000,00", () => {
    const result = createDepositSchema.safeParse({
      grossAmountCents: 500_001,
      payerTaxId: validCpf,
    });

    expect(result.success).toBe(false);
  });

  it("accepts empty and valid phone", () => {
    expect(createDepositSchema.safeParse({ grossAmountCents: 49_999, payerPhone: "" }).success).toBe(true);
    expect(createDepositSchema.safeParse({ grossAmountCents: 49_999, payerPhone: "86999991234" }).success).toBe(true);
  });

  it("rejects invalid phone", () => {
    const result = createDepositSchema.safeParse({
      grossAmountCents: 49_999,
      payerPhone: "123",
    });

    expect(result.success).toBe(false);
  });
});
