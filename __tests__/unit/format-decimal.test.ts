/**
 * D1 — formatDecimalBRL: valores em REAIS que chegam como Decimal/number/string/nulo.
 */
import { describe, it, expect } from "vitest";
import { formatDecimalBRL, formatReaisBRL } from "@/lib/format";

describe("formatDecimalBRL", () => {
  it("Decimal (objeto com toNumber) formata como reais", () => {
    const decimal = { toNumber: () => 123.45 };
    expect(formatDecimalBRL(decimal)).toBe(formatReaisBRL(123.45).replace(/ /g, " "));
  });

  it("number e string em reais", () => {
    expect(formatDecimalBRL(50)).toMatch(/50,00/);
    expect(formatDecimalBRL("50")).toMatch(/50,00/);
  });

  it("null/undefined/NaN viram '-' (não R$ 0,00 enganoso)", () => {
    expect(formatDecimalBRL(null)).toBe("-");
    expect(formatDecimalBRL(undefined)).toBe("-");
    expect(formatDecimalBRL("abc")).toBe("-");
  });

  it("zero é formatado (não vira '-')", () => {
    expect(formatDecimalBRL(0)).toMatch(/0,00/);
  });
});
