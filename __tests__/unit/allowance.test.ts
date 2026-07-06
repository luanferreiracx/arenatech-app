import { describe, it, expect } from "vitest";
import { calcAllowance } from "@/lib/commission/allowance";

describe("calcAllowance", () => {
  it("paga o total do mes quando nao ha dias nao cobertos", () => {
    // 600 + 0 + 100 = 700; sem teto
    expect(
      calcAllowance({ meal: 600, transport: 0, cellphone: 100, cap: 0, daysInMonth: 30, uncoveredDays: 0 }),
    ).toBe(700);
  });

  it("desconta proporcionalmente os dias nao cobertos (os 3 campos)", () => {
    // 700 × 27/30 = 630
    expect(
      calcAllowance({ meal: 600, transport: 0, cellphone: 100, cap: 0, daysInMonth: 30, uncoveredDays: 3 }),
    ).toBe(630);
  });

  it("proporcao afeta refeicao, deslocamento E celular", () => {
    // (200 + 300 + 100) × 15/30 = 300
    expect(
      calcAllowance({ meal: 200, transport: 300, cellphone: 100, cap: 0, daysInMonth: 30, uncoveredDays: 15 }),
    ).toBe(300);
  });

  it("limita ao teto quando o total passa dele", () => {
    // (200 + 300 + 100) = 600 cheio, teto 600 → 600
    expect(
      calcAllowance({ meal: 200, transport: 300, cellphone: 100, cap: 600, daysInMonth: 30, uncoveredDays: 0 }),
    ).toBe(600);
    // total 1000, teto 600 → 600
    expect(
      calcAllowance({ meal: 500, transport: 500, cellphone: 0, cap: 600, daysInMonth: 30, uncoveredDays: 0 }),
    ).toBe(600);
  });

  it("teto aplica sobre o valor ja proporcional", () => {
    // total 1000 × 15/30 = 500; teto 600 nao corta → 500
    expect(
      calcAllowance({ meal: 500, transport: 500, cellphone: 0, cap: 600, daysInMonth: 30, uncoveredDays: 15 }),
    ).toBe(500);
  });

  it("retorna zero quando todos os valores sao zero", () => {
    expect(
      calcAllowance({ meal: 0, transport: 0, cellphone: 0, cap: 600, daysInMonth: 30, uncoveredDays: 0 }),
    ).toBe(0);
  });

  it("mes inteiro nao coberto = zero", () => {
    expect(
      calcAllowance({ meal: 600, transport: 0, cellphone: 100, cap: 0, daysInMonth: 30, uncoveredDays: 30 }),
    ).toBe(0);
  });

  it("arredonda para centavos", () => {
    // 100 × 1/3 (fev com 28 dias, ...) — usa um caso que gera dizimo
    // 100 × 10/30 = 33.333... → 33.33
    expect(
      calcAllowance({ meal: 100, transport: 0, cellphone: 0, cap: 0, daysInMonth: 30, uncoveredDays: 20 }),
    ).toBe(33.33);
  });
});
