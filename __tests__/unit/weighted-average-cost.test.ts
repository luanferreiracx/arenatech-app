/**
 * A2 — custo médio ponderado móvel (centavos). Função pura, guarda os casos de
 * borda que mais importam para não corromper o custo do estoque.
 */
import { describe, it, expect } from "vitest";
import { weightedAverageCostCents } from "@/lib/stock/weighted-average";

describe("weightedAverageCostCents", () => {
  it("primeira valoração (sem saldo): assume o custo da entrada", () => {
    expect(weightedAverageCostCents(0, null, 5, 2000)).toBe(2000);
    expect(weightedAverageCostCents(0, 0, 5, 2000)).toBe(2000);
  });

  it("sem histórico de custo (custo atual nulo): assume o custo da entrada", () => {
    expect(weightedAverageCostCents(10, null, 5, 1500)).toBe(1500);
  });

  it("média ponderada padrão", () => {
    // 10 un @ R$10,00 + 10 un @ R$20,00 = 20 un @ R$15,00
    expect(weightedAverageCostCents(10, 1000, 10, 2000)).toBe(1500);
  });

  it("arredonda ao centavo", () => {
    // (3×1000 + 1×1100) / 4 = 1025
    expect(weightedAverageCostCents(3, 1000, 1, 1100)).toBe(1025);
    // (2×1000 + 1×1100) / 3 = 1033.33 → 1033
    expect(weightedAverageCostCents(2, 1000, 1, 1100)).toBe(1033);
  });

  it("entrada de quantidade zero: mantém o custo atual", () => {
    expect(weightedAverageCostCents(10, 1000, 0, 9999)).toBe(1000);
  });

  it("não é enviesado por floats (valores grandes)", () => {
    // 100 @ 333 + 1 @ 999 = (33300 + 999)/101 = 339.59 → 340
    expect(weightedAverageCostCents(100, 333, 1, 999)).toBe(340);
  });
});
