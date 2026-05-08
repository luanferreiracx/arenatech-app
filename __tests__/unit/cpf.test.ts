import { describe, it, expect } from "vitest";
import { validateCpf, normalizeCpf, cpfSchema } from "@/lib/validators/cpf";

describe("normalizeCpf", () => {
  it("removes dots and dash from formatted CPF", () => {
    expect(normalizeCpf("123.456.789-09")).toBe("12345678909");
  });

  it("returns raw digits unchanged", () => {
    expect(normalizeCpf("12345678909")).toBe("12345678909");
  });

  it("strips spaces and other chars", () => {
    expect(normalizeCpf(" 123 456 789 09 ")).toBe("12345678909");
  });
});

describe("validateCpf", () => {
  // Known valid CPFs (from public test generators)
  const validCpfs = [
    "12345678909",
    "123.456.789-09",
    "52998224725",
    "529.982.247-25",
    "11144477735",
    "11144477700", // another valid pattern
  ];

  // Recalculate: 11144477700 — let me use only definitely valid ones
  const knownValid = [
    "12345678909",
    "52998224725",
    "11144477735",
  ];

  it.each(knownValid)("accepts valid CPF: %s", (cpf) => {
    expect(validateCpf(cpf)).toBe(true);
  });

  it("accepts formatted valid CPF", () => {
    expect(validateCpf("123.456.789-09")).toBe(true);
    expect(validateCpf("529.982.247-25")).toBe(true);
  });

  // All-same-digit CPFs must be rejected
  const allSame = [
    "00000000000",
    "111.111.111-11",
    "22222222222",
    "33333333333",
    "44444444444",
    "55555555555",
    "66666666666",
    "77777777777",
    "88888888888",
    "99999999999",
  ];

  it.each(allSame)("rejects all-same-digit CPF: %s", (cpf) => {
    expect(validateCpf(cpf)).toBe(false);
  });

  it("rejects CPF with wrong check digits", () => {
    expect(validateCpf("12345678900")).toBe(false);
    expect(validateCpf("52998224700")).toBe(false);
  });

  it("rejects too short", () => {
    expect(validateCpf("1234567890")).toBe(false);
    expect(validateCpf("123")).toBe(false);
  });

  it("rejects too long", () => {
    expect(validateCpf("123456789012")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(validateCpf("")).toBe(false);
  });

  it("rejects garbage", () => {
    expect(validateCpf("abcdefghijk")).toBe(false);
    expect(validateCpf("abc.def.ghi-jk")).toBe(false);
  });
});

describe("cpfSchema", () => {
  it("parses and normalizes valid formatted CPF", () => {
    const result = cpfSchema.safeParse("123.456.789-09");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe("12345678909");
    }
  });

  it("parses valid raw CPF", () => {
    const result = cpfSchema.safeParse("52998224725");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe("52998224725");
    }
  });

  it("rejects invalid CPF with error message", () => {
    const result = cpfSchema.safeParse("111.111.111-11");
    expect(result.success).toBe(false);
  });

  it("rejects empty string", () => {
    const result = cpfSchema.safeParse("");
    expect(result.success).toBe(false);
  });
});
