import { describe, it, expect } from "vitest";
import { computeBucketCommission, type BucketRule, type BucketEvent } from "@/lib/commission/bucket-commission";

const percentProfit = (rate: number, rangeMax: number | null = null): BucketRule => ({
  valueType: "PERCENT",
  base: "PROFIT",
  rangeMin: 0,
  rangeMax,
  rate,
});

describe("computeBucketCommission", () => {
  it("retorna vazio sem regras ou sem eventos", () => {
    expect(computeBucketCommission([], [{ baseProfit: 100, baseGrossNet: 200, qty: 1 }])).toEqual([]);
    expect(computeBucketCommission([percentProfit(10)], [])).toEqual([]);
  });

  it("percentual sobre o LUCRO (base default)", () => {
    // 10% sobre lucro 100 = 10
    const r = computeBucketCommission(
      [percentProfit(10)],
      [{ baseProfit: 100, baseGrossNet: 500, qty: 1 }],
    );
    expect(r[0]!.comissao).toBe(10);
    expect(r[0]!.base).toBe(100);
    expect(r[0]!.tipoValor).toBe("PERCENT");
  });

  it("percentual sobre o TOTAL liquido (GROSS_NET)", () => {
    // 10% sobre total 500 = 50 (nao 10 do lucro)
    const rule: BucketRule = { valueType: "PERCENT", base: "GROSS_NET", rangeMin: 0, rangeMax: null, rate: 10 };
    const r = computeBucketCommission([rule], [{ baseProfit: 100, baseGrossNet: 500, qty: 1 }]);
    expect(r[0]!.comissao).toBe(50);
    expect(r[0]!.base).toBe(500);
  });

  it("valor fixo por unidade × quantidade", () => {
    // R$ 50 por aparelho, evento com 3 unidades = 150
    const rule: BucketRule = { valueType: "FIXED_PER_UNIT", base: "PROFIT", rangeMin: 0, rangeMax: null, rate: 50 };
    const r = computeBucketCommission([rule], [{ baseProfit: 9999, baseGrossNet: 9999, qty: 3 }]);
    expect(r[0]!.comissao).toBe(150);
    expect(r[0]!.tipoValor).toBe("FIXED_PER_UNIT");
    expect(r[0]!.aliquotaEfetiva).toBe(0);
  });

  it("valor fixo: soma entre varios eventos por suas quantidades", () => {
    const rule: BucketRule = { valueType: "FIXED_PER_UNIT", base: "PROFIT", rangeMin: 0, rangeMax: null, rate: 50 };
    const r = computeBucketCommission(rule ? [rule] : [], [
      { baseProfit: 0, baseGrossNet: 0, qty: 2 },
      { baseProfit: 0, baseGrossNet: 0, qty: 1 },
    ]);
    expect(r.map((x) => x.comissao)).toEqual([100, 50]);
  });

  it("faixas progressivas sobre a base acumulada do balde, rateadas por evento", () => {
    // Faixas: 0..100 @10%, 100..∞ @20%. Dois eventos de lucro 100 cada (total 200):
    // comissao total = 100*10% + 100*20% = 10 + 20 = 30, rateada 50/50 = 15 cada.
    const rules: BucketRule[] = [
      { valueType: "PERCENT", base: "PROFIT", rangeMin: 0, rangeMax: 100, rate: 10 },
      { valueType: "PERCENT", base: "PROFIT", rangeMin: 100, rangeMax: null, rate: 20 },
    ];
    const r = computeBucketCommission(rules, [
      { baseProfit: 100, baseGrossNet: 0, qty: 1 },
      { baseProfit: 100, baseGrossNet: 0, qty: 1 },
    ]);
    expect(r.map((x) => x.comissao)).toEqual([15, 15]);
  });
});
