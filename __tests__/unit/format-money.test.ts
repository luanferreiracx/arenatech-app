/**
 * D1 — formatters de dinheiro centralizados. Trava a distinção centavos vs reais
 * (a causa dos bugs de 100× quando cada arquivo redefinia formatCurrency).
 */
import { describe, it, expect } from "vitest";
import { formatCentsBRL, formatReaisBRL } from "@/lib/format";

describe("format money", () => {
  it("centavos e reais equivalentes produzem o mesmo texto", () => {
    expect(formatCentsBRL(12345)).toBe(formatReaisBRL(123.45));
    expect(formatCentsBRL(100)).toBe(formatReaisBRL(1));
    expect(formatCentsBRL(0)).toBe(formatReaisBRL(0));
  });

  it("mesmo número em contratos diferentes difere em 100x (guarda anti-bug)", () => {
    expect(formatCentsBRL(100)).not.toBe(formatReaisBRL(100));
    expect(formatCentsBRL(100)).toBe(formatReaisBRL(1));
  });

  it("formata em BRL (contém R$ e a parte decimal)", () => {
    expect(formatCentsBRL(12345)).toMatch(/R\$/);
    expect(formatCentsBRL(12345)).toMatch(/123,45/);
  });
});
