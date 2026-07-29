/**
 * Finalização — Módulo 5 (Financeiro), FIN-1.
 *
 * O sistema guarda DUAS semânticas de data na mesma forma (`timestamp` sem
 * fuso) e os filtros tratavam as duas igual:
 *
 * - **data pura** (`emissionDate`, `dueDate`) — o app grava meia-noite UTC
 *   porque o que importa é o dia;
 * - **instante** (`paidAt`, `expectedSettlementDate`) — hora de verdade.
 *
 * A armadilha é contraintuitiva: aplicar BRT numa data pura **exclui o próprio
 * dia**, porque meia-noite UTC é anterior ao início do dia BRT (03:00Z). Foi o
 * que impediu a correção ingênua de "aplicar BRT em tudo".
 */
import { describe, it, expect } from "vitest";
import { instantRange, pureDateRange } from "@/lib/utils/date-filter";

describe("FIN-1 — faixa de data pura", () => {
  it("inclui o registro gravado à meia-noite UTC do próprio dia", () => {
    const range = pureDateRange("2026-07-01", "2026-07-01");
    const gravado = new Date("2026-07-01T00:00:00.000Z");

    expect(range.gte!.getTime()).toBeLessThanOrEqual(gravado.getTime());
    expect(gravado.getTime()).toBeLessThan(range.lt!.getTime());
  });

  it("é meio-aberta: exclui a meia-noite do dia seguinte", () => {
    const range = pureDateRange("2026-07-01", "2026-07-01");
    expect(range.lt!.toISOString()).toBe("2026-07-02T00:00:00.000Z");
  });

  it("atravessa a virada de mês sem perder o último dia", () => {
    const range = pureDateRange("2026-07-30", "2026-07-31");
    const ultimoDia = new Date("2026-07-31T00:00:00.000Z");
    expect(ultimoDia.getTime()).toBeLessThan(range.lt!.getTime());
    expect(range.lt!.toISOString()).toBe("2026-08-01T00:00:00.000Z");
  });
});

describe("FIN-1 — faixa de instante", () => {
  it("inclui o que aconteceu às 22h BRT do último dia", () => {
    const range = instantRange("2026-07-01", "2026-07-01");
    // 22h BRT de 01/07 = 01:00Z de 02/07 — o horário que o filtro cru perdia.
    const pagoTardeDaNoite = new Date("2026-07-02T01:00:00.000Z");

    expect(pagoTardeDaNoite.getTime()).toBeGreaterThanOrEqual(range.gte!.getTime());
    expect(pagoTardeDaNoite.getTime()).toBeLessThanOrEqual(range.lte!.getTime());
  });

  it("não inclui o que aconteceu já no dia BRT seguinte", () => {
    const range = instantRange("2026-07-01", "2026-07-01");
    // 00:30 BRT de 02/07 = 03:30Z de 02/07.
    const jaEhOutroDia = new Date("2026-07-02T03:30:00.000Z");
    expect(jaEhOutroDia.getTime()).toBeGreaterThan(range.lte!.getTime());
  });

  it("começa às 03:00Z, que é a meia-noite BRT", () => {
    const range = instantRange("2026-07-01", "2026-07-01");
    expect(range.gte!.toISOString()).toBe("2026-07-01T03:00:00.000Z");
  });
});
