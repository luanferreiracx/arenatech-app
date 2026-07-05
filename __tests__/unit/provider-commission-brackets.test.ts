import { describe, it, expect } from "vitest";
import { applyProgressiveBrackets } from "@/lib/commission/progressive-brackets";

/**
 * Faixas progressivas estilo IR: cada porcao da base recebe a aliquota da sua
 * faixa. Paridade com ComissaoEngine::aplicarFaixasProgressivas (Laravel).
 */
describe("applyProgressiveBrackets", () => {
  it("returns zero for empty rules", () => {
    expect(applyProgressiveBrackets(1000, [])).toBe(0);
  });

  it("applies a single open bracket over the whole base", () => {
    // 10% de 1000 = 100
    expect(applyProgressiveBrackets(1000, [{ rangeMin: 0, rangeMax: null, rate: 10 }])).toBe(100);
  });

  it("taxes each portion at its own bracket rate", () => {
    // 0..5000 @ 10% = 500 ; 5000..∞ @ 20% sobre 3000 = 600 ; total 1100
    const rules = [
      { rangeMin: 0, rangeMax: 5000, rate: 10 },
      { rangeMin: 5000, rangeMax: null, rate: 20 },
    ];
    expect(applyProgressiveBrackets(8000, rules)).toBe(1100);
  });

  it("only fills brackets up to the base", () => {
    // base 3000 cai inteira na 1a faixa (0..5000 @ 10%) = 300; 2a faixa nao aplica
    const rules = [
      { rangeMin: 0, rangeMax: 5000, rate: 10 },
      { rangeMin: 5000, rangeMax: null, rate: 20 },
    ];
    expect(applyProgressiveBrackets(3000, rules)).toBe(300);
  });

  it("rounds to cents", () => {
    // 7.5% de 333.33 = 24.99975 → 25.00
    expect(applyProgressiveBrackets(333.33, [{ rangeMin: 0, rangeMax: null, rate: 7.5 }])).toBe(25);
  });

  it("returns zero when base is below the first bracket floor", () => {
    // base 500, faixa comeca em 1000 → nada aplica
    expect(applyProgressiveBrackets(500, [{ rangeMin: 1000, rangeMax: null, rate: 10 }])).toBe(0);
  });
});
