/**
 * Helpers para interpretar intervalos de data em filtros, considerando o
 * timezone Brasil (UTC-3, sem horário de verão desde 2019).
 *
 * Problema que isso resolve: `new Date("2026-05-25T23:59:59")` em servidor
 * UTC gera `2026-05-25T23:59:59Z` = `20:59 BRT` — corta as últimas 3 horas
 * do dia para quem vive em BRT. Usar `-03:00` no offset corrige.
 */

const BRT_OFFSET = "-03:00";

/**
 * `2026-05-25` (YYYY-MM-DD) → Date que representa o fim do dia em BRT
 * (23:59:59.999 BRT = 02:59:59.999 UTC do dia seguinte).
 */
export function endOfDayBrt(yyyyMmDd: string): Date {
  return new Date(`${yyyyMmDd}T23:59:59.999${BRT_OFFSET}`);
}

/**
 * `2026-05-25` (YYYY-MM-DD) → Date que representa o início do dia em BRT
 * (00:00:00 BRT = 03:00:00 UTC do mesmo dia).
 */
export function startOfDayBrt(yyyyMmDd: string): Date {
  return new Date(`${yyyyMmDd}T00:00:00.000${BRT_OFFSET}`);
}

/**
 * Componentes de calendário (ano/mês/dia) de um instante NO FUSO BRT, mesmo que
 * o processo rode em UTC. Sem isso, "hoje" calculado com `now.getDate()` usa o
 * fuso do processo (UTC no container) e vaza vendas de ~21h-24h BRT do dia
 * anterior para "hoje".
 */
export function brtDateParts(instant: Date = new Date()): { year: number; month: number; day: number } {
  // en-CA formata como YYYY-MM-DD, fácil de fatiar.
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(instant)
    .split("-")
    .map(Number);
  return { year: y!, month: m!, day: d! };
}

/** Início do dia CORRENTE em BRT (00:00 BRT), como instante absoluto. */
export function startOfTodayBrt(now: Date = new Date()): Date {
  const { year, month, day } = brtDateParts(now);
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return new Date(`${year}-${mm}-${dd}T00:00:00.000${BRT_OFFSET}`);
}

/** Início do mês CORRENTE em BRT (dia 1, 00:00 BRT). */
export function startOfMonthBrt(now: Date = new Date()): Date {
  const { year, month } = brtDateParts(now);
  const mm = String(month).padStart(2, "0");
  return new Date(`${year}-${mm}-01T00:00:00.000${BRT_OFFSET}`);
}

/** Início do mês ANTERIOR em BRT. */
export function startOfPrevMonthBrt(now: Date = new Date()): Date {
  const { year, month } = brtDateParts(now);
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const mm = String(prevMonth).padStart(2, "0");
  return new Date(`${prevYear}-${mm}-01T00:00:00.000${BRT_OFFSET}`);
}

/** Fim do mês ANTERIOR em BRT (23:59:59.999 do último dia). */
export function endOfPrevMonthBrt(now: Date = new Date()): Date {
  // Fim do mês anterior = 1ms antes do início do mês corrente.
  return new Date(startOfMonthBrt(now).getTime() - 1);
}

/** Chave de dia (YYYY-MM-DD) de um instante NO FUSO BRT — para agrupar por dia. */
export function brtDayKey(instant: Date): string {
  const { year, month, day } = brtDateParts(instant);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
