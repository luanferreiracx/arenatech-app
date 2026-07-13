import { describe, it, expect } from "vitest";
import {
  startOfTodayBrt,
  startOfMonthBrt,
  startOfPrevMonthBrt,
  endOfPrevMonthBrt,
  startOfNextMonthBrt,
  endOfMonthBrt,
  brtDayKey,
} from "@/lib/utils/date-range";

/**
 * Fronteiras de dia/mês ancoradas em BRT (o container de prod roda UTC). Os
 * instantes UTC abaixo são absolutos (independem do TZ de quem roda o teste).
 * Bug que isto corrige: uma venda de 11/jul 20:24 BRT (= 11/jul 23:24 UTC) era
 * gravada com sale_date 12/jul 00:02 UTC e, com "hoje" calculado em UTC,
 * aparecia como venda de HOJE (12/jul) no painel.
 */
describe("date-range BRT — fronteiras ancoradas no fuso Brasil", () => {
  it("startOfTodayBrt: às 11:53 UTC de 12/jul, hoje BRT começa em 12/jul 00:00 BRT = 03:00 UTC", () => {
    const now = new Date("2026-07-12T11:53:00.000Z"); // 08:53 BRT
    expect(startOfTodayBrt(now).toISOString()).toBe("2026-07-12T03:00:00.000Z");
  });

  it("startOfTodayBrt: às 01:00 UTC (=22:00 BRT do dia anterior), o dia BRT ainda é 11/jul", () => {
    const now = new Date("2026-07-12T01:00:00.000Z"); // 11/jul 22:00 BRT
    // hoje-BRT = 11/jul → começa 11/jul 00:00 BRT = 11/jul 03:00 UTC
    expect(startOfTodayBrt(now).toISOString()).toBe("2026-07-11T03:00:00.000Z");
  });

  it("uma venda de 12/jul 00:02 UTC (= 11/jul 21:02 BRT) NÃO cai em 'hoje BRT' de 12/jul", () => {
    const now = new Date("2026-07-12T11:53:00.000Z");
    const saleInstant = new Date("2026-07-12T00:02:00.000Z"); // 11/jul 21:02 BRT
    // A venda é ANTES do início de hoje-BRT (12/jul 03:00 UTC) → fora de "hoje".
    expect(saleInstant < startOfTodayBrt(now)).toBe(true);
  });

  it("startOfMonthBrt: julho começa em 01/jul 00:00 BRT = 03:00 UTC", () => {
    const now = new Date("2026-07-12T11:53:00.000Z");
    expect(startOfMonthBrt(now).toISOString()).toBe("2026-07-01T03:00:00.000Z");
  });

  it("prev month: junho começa 01/jun 03:00 UTC; fim = 1ms antes de 01/jul 03:00 UTC", () => {
    const now = new Date("2026-07-12T11:53:00.000Z");
    expect(startOfPrevMonthBrt(now).toISOString()).toBe("2026-06-01T03:00:00.000Z");
    expect(endOfPrevMonthBrt(now).toISOString()).toBe("2026-07-01T02:59:59.999Z");
  });

  it("virada de ano: em janeiro, prev month é dezembro do ano anterior", () => {
    const now = new Date("2026-01-10T12:00:00.000Z");
    expect(startOfPrevMonthBrt(now).toISOString()).toBe("2025-12-01T03:00:00.000Z");
  });

  it("brtDayKey: 12/jul 00:02 UTC agrupa no dia 11/jul (BRT)", () => {
    expect(brtDayKey(new Date("2026-07-12T00:02:00.000Z"))).toBe("2026-07-11");
    expect(brtDayKey(new Date("2026-07-12T03:00:00.000Z"))).toBe("2026-07-12");
  });

  // Novos helpers (auditoria 2026-07-13, E1) usados em financial/fiscal stats.
  it("startOfNextMonthBrt / endOfMonthBrt: agosto começa 01/ago 03:00 UTC; fim de julho = 1ms antes", () => {
    const now = new Date("2026-07-12T11:53:00.000Z");
    expect(startOfNextMonthBrt(now).toISOString()).toBe("2026-08-01T03:00:00.000Z");
    expect(endOfMonthBrt(now).toISOString()).toBe("2026-08-01T02:59:59.999Z");
  });

  it("endOfMonthBrt vira o ano: dezembro → próximo mês é janeiro do ano seguinte", () => {
    const dec = new Date("2026-12-15T12:00:00.000Z");
    expect(startOfNextMonthBrt(dec).toISOString()).toBe("2027-01-01T03:00:00.000Z");
  });
});
