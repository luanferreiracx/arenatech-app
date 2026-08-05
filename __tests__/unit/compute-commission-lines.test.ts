import { describe, it, expect } from "vitest";
import {
  computeCommissionLines,
  summarizeCommissionLines,
  toNumericRules,
  type CommissionEvent,
  type CommissionRuleNumeric,
} from "@/lib/commission/compute-lines";

function makeEvent(overrides: Partial<CommissionEvent> = {}): CommissionEvent {
  return {
    tipo: "venda",
    referencia_id: "sale-1",
    referencia_label: "Venda #1",
    data: "2026-07-10",
    categoria: "produto_acessorio",
    escopo: "normal",
    category: "produto_acessorio",
    scope: "normal",
    source: "OWN",
    base: 100,
    baseProfit: 100,
    baseGrossNet: 500,
    qty: 1,
    detalhe: {},
    ...overrides,
  };
}

const percentProfit = (
  overrides: Partial<CommissionRuleNumeric> = {},
): CommissionRuleNumeric => ({
  category: "produto_acessorio",
  scope: "normal",
  source: "OWN",
  valueType: "PERCENT",
  base: "PROFIT",
  rangeMin: 0,
  rangeMax: null,
  rate: 10,
  ...overrides,
});

describe("computeCommissionLines", () => {
  it("vazio quando nao ha eventos", () => {
    const { lines, grossCommission } = computeCommissionLines([], [percentProfit()]);
    expect(lines).toEqual([]);
    expect(grossCommission).toBe(0);
  });

  it("agrupa por balde (categoria|escopo|origem) e aplica a regra correspondente", () => {
    // 10% sobre lucro 100 = 10
    const { lines, grossCommission } = computeCommissionLines([makeEvent()], [percentProfit()]);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.comissao).toBe(10);
    expect(lines[0]!.origem).toBe("OWN");
    expect(grossCommission).toBe(10);
  });

  it("ignora eventos sem regra correspondente no contrato", () => {
    // Evento premium, mas so ha regra normal → nenhuma linha, comissao zero.
    const premiumEvent = makeEvent({ escopo: "premium", scope: "premium" });
    const { lines, grossCommission } = computeCommissionLines([premiumEvent], [percentProfit()]);
    expect(lines).toEqual([]);
    expect(grossCommission).toBe(0);
  });

  it("soma comissoes de baldes distintos", () => {
    const acessorio = makeEvent();
    const aparelho = makeEvent({
      referencia_id: "sale-2",
      categoria: "produto_aparelho",
      category: "produto_aparelho",
      baseProfit: 200,
    });
    const rules = [
      percentProfit(),
      percentProfit({ category: "produto_aparelho", rate: 5 }),
    ];
    const { grossCommission } = computeCommissionLines([acessorio, aparelho], rules);
    // 10% de 100 (=10) + 5% de 200 (=10) = 20
    expect(grossCommission).toBe(20);
  });

  it("separa OWN de STORE mesmo na mesma categoria/escopo", () => {
    const own = makeEvent();
    const store = makeEvent({ referencia_id: "sale-3", source: "STORE" });
    // So ha regra OWN → a venda STORE nao comissiona.
    const { lines, grossCommission } = computeCommissionLines([own, store], [percentProfit()]);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.source).toBe("OWN");
    expect(grossCommission).toBe(10);
  });

  // Intermediacao de OS aceita valor fixo (antes so percentual). O evento de
  // intermediacao entra com qty=1, entao o fixo paga R$ rate por OS captada —
  // independente do valor do servico.
  it("valor fixo em intermediacao paga por OS captada, nao pelo valor do servico", () => {
    const intermediacao = (id: string, overrides: Partial<CommissionEvent> = {}) =>
      makeEvent({
        tipo: "servico_intermediacao",
        referencia_id: id,
        categoria: "intermediacao_at",
        category: "intermediacao_at",
        qty: 1,
        ...overrides,
      });
    const fixedRule: CommissionRuleNumeric = {
      category: "intermediacao_at",
      scope: "normal",
      source: "OWN",
      valueType: "FIXED_PER_UNIT",
      base: "PROFIT",
      rangeMin: 0,
      rangeMax: null,
      rate: 25,
    };

    // Duas OS captadas com valores MUITO diferentes: cada uma paga os mesmos R$ 25.
    const { lines, grossCommission } = computeCommissionLines(
      [
        intermediacao("os-1", { baseProfit: 80, baseGrossNet: 120 }),
        intermediacao("os-2", { baseProfit: 4000, baseGrossNet: 9000 }),
      ],
      [fixedRule],
    );
    expect(lines.map((l) => l.comissao)).toEqual([25, 25]);
    expect(lines[0]!.tipo_valor).toBe("FIXED_PER_UNIT");
    expect(grossCommission).toBe(50);
  });

  it("intermediacao percentual segue rateando pela base (comportamento historico)", () => {
    const intermediacao = makeEvent({
      tipo: "servico_intermediacao",
      referencia_id: "os-1",
      categoria: "intermediacao_at",
      category: "intermediacao_at",
      baseProfit: 200,
    });
    const { grossCommission } = computeCommissionLines(
      [intermediacao],
      [percentProfit({ category: "intermediacao_at", rate: 3 })],
    );
    // 3% sobre lucro 200 = 6
    expect(grossCommission).toBe(6);
  });
});

describe("summarizeCommissionLines", () => {
  it("subtotaliza por balde com base, comissao e quantidade", () => {
    const a = makeEvent({ baseProfit: 100 });
    const b = makeEvent({ referencia_id: "sale-2", baseProfit: 100 });
    const { lines } = computeCommissionLines([a, b], [percentProfit()]);
    const subtotals = summarizeCommissionLines(lines);
    const key = "produto_acessorio|normal|OWN";
    expect(subtotals[key]).toBeDefined();
    expect(subtotals[key]!.qtd).toBe(2);
    expect(subtotals[key]!.base).toBe(200);
    expect(subtotals[key]!.comissao).toBe(20);
  });

  it("vazio quando nao ha linhas", () => {
    expect(summarizeCommissionLines([])).toEqual({});
  });
});

describe("toNumericRules", () => {
  it("converte Decimals (via Number) e preserva rangeMax nulo", () => {
    const rules = toNumericRules([
      {
        category: "produto_aparelho",
        scope: "premium",
        source: "STORE",
        valueType: "PERCENT",
        base: "GROSS_NET",
        rangeMin: 0,
        rangeMax: null,
        rate: 7.5,
      },
    ]);
    expect(rules[0]).toEqual({
      category: "produto_aparelho",
      scope: "premium",
      source: "STORE",
      valueType: "PERCENT",
      base: "GROSS_NET",
      rangeMin: 0,
      rangeMax: null,
      rate: 7.5,
    });
  });
});
