/**
 * Finalização — Módulo 8, CM-1: os dias do mês do rateio da ajuda de custo não
 * podem depender do fuso do processo.
 *
 * `calculateAllowance` derivava `daysInMonth` de `periodEnd.getDate()`.
 * `periodEnd` é 23:59:59.999 **BRT** do último dia — ou seja, 02:59 UTC do dia 1º
 * do mês seguinte. `getDate()` lê no fuso do processo:
 *
 *   - na máquina do desenvolvedor (America/Sao_Paulo) → 31, certo;
 *   - no container de produção (UTC, confirmado por `docker exec ... date`) → **1**.
 *
 * Com `daysInMonth = 1`, `calcAllowance` faz `effectiveDays = max(0, 1 - N)`:
 * sem dia descoberto a proporção dá 1/1 e o valor sai certo por acidente — que é
 * por que ninguém notou. Com **um único** dia descoberto, `effectiveDays` vira 0
 * e o prestador perde a ajuda de custo do mês inteiro (R$ 1.000+ nos contratos
 * de produção).
 *
 * Estes testes trocam o fuso do processo de propósito: é a única forma de
 * reproduzir aqui o que só acontecia na VPS.
 */
import { describe, it, expect, afterEach } from "vitest";
import { monthRange } from "@/lib/commission/month-range";
import { calcAllowance } from "@/lib/commission/allowance";

const TZ_ORIGINAL = process.env.TZ;

afterEach(() => {
  process.env.TZ = TZ_ORIGINAL;
});

/** Fusos que importam: o do dono da loja e o do container de produção. */
const FUSOS = ["America/Sao_Paulo", "UTC"] as const;

describe("CM-1 — dias do mês da apuração independem do fuso do processo", () => {
  it("monthRange devolve os dias do mês certos em qualquer fuso", () => {
    for (const tz of FUSOS) {
      process.env.TZ = tz;
      expect(monthRange(2026, 7).daysInMonth, `julho em ${tz}`).toBe(31);
      expect(monthRange(2026, 6).daysInMonth, `junho em ${tz}`).toBe(30);
      expect(monthRange(2026, 2).daysInMonth, `fevereiro em ${tz}`).toBe(28);
      expect(monthRange(2024, 2).daysInMonth, `fevereiro bissexto em ${tz}`).toBe(29);
    }
  });

  it("a derivação antiga (getDate no fim do período) erra em UTC — é o bug", () => {
    // Guarda de raciocínio: se um dia isto passar a devolver 31 em UTC, a
    // premissa do achado mudou e o teste acima perdeu o motivo de existir.
    process.env.TZ = "UTC";
    expect(monthRange(2026, 7).end.getDate()).toBe(1);
    process.env.TZ = "America/Sao_Paulo";
    expect(monthRange(2026, 7).end.getDate()).toBe(31);
  });

  it("um dia descoberto desconta um dia, não o mês inteiro", () => {
    for (const tz of FUSOS) {
      process.env.TZ = tz;
      const { daysInMonth } = monthRange(2026, 7);
      // Contrato real de produção: R$ 1.000/mês de ajuda, sem teto.
      const valor = calcAllowance({
        meal: 1000,
        transport: 0,
        cellphone: 0,
        cap: 0,
        daysInMonth,
        uncoveredDays: 1,
      });
      // 30 de 31 dias = R$ 967,74. Com o bug dava R$ 0,00.
      expect(valor, `julho em ${tz}`).toBeCloseTo(967.74, 2);
    }
  });

  it("sem dia descoberto o valor é integral (era certo por acidente)", () => {
    for (const tz of FUSOS) {
      process.env.TZ = tz;
      const { daysInMonth } = monthRange(2026, 7);
      expect(
        calcAllowance({ meal: 1000, transport: 0, cellphone: 0, cap: 0, daysInMonth, uncoveredDays: 0 }),
      ).toBe(1000);
    }
  });
});
