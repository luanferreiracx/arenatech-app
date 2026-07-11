import { describe, it, expect } from "vitest";
import { monthRange } from "@/lib/commission/month-range";

/**
 * J3 (auditoria comissão 2026-07-11): a fronteira do mês de apuração é ancorada
 * em BRT (-03:00), NÃO no fuso do processo. Como o container de prod roda UTC,
 * o cálculo antigo (`new Date(year, month-1, 1)`) deslocava o corte em 3h e
 * vazava vendas de fim-de-mês BRT para o mês seguinte. Os instantes UTC abaixo
 * são absolutos (independem do TZ de quem roda o teste) — é isso que prova o fix.
 */
describe("monthRange — fronteira ancorada em BRT (J3)", () => {
  it("julho/2026 começa em 01/jul 00:00 BRT = 03:00 UTC", () => {
    expect(monthRange(2026, 7).start.toISOString()).toBe("2026-07-01T03:00:00.000Z");
  });

  it("julho/2026 termina em 31/jul 23:59:59.999 BRT = 01/ago 02:59:59.999 UTC", () => {
    expect(monthRange(2026, 7).end.toISOString()).toBe("2026-08-01T02:59:59.999Z");
  });

  it("fevereiro respeita o último dia (28 em ano comum)", () => {
    expect(monthRange(2026, 2).end.toISOString()).toBe("2026-03-01T02:59:59.999Z");
  });

  it("fevereiro em ano bissexto vai até dia 29", () => {
    expect(monthRange(2028, 2).end.toISOString()).toBe("2028-03-01T02:59:59.999Z");
  });

  it("dezembro fecha no fim do ano (vira p/ jan do ano seguinte em UTC)", () => {
    expect(monthRange(2026, 12).end.toISOString()).toBe("2027-01-01T02:59:59.999Z");
  });

  it("venda de 31/jul 22:00 BRT cai DENTRO de julho (não vaza p/ agosto)", () => {
    const { start, end } = monthRange(2026, 7);
    const venda = new Date("2026-07-31T22:00:00.000-03:00"); // = 2026-08-01T01:00Z
    expect(venda >= start && venda <= end).toBe(true);
  });

  it("venda de 30/jun 23:00 BRT NÃO entra em julho", () => {
    const venda = new Date("2026-06-30T23:00:00.000-03:00"); // = 2026-07-01T02:00Z
    expect(venda < monthRange(2026, 7).start).toBe(true);
  });
});
