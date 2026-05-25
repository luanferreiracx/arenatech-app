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
