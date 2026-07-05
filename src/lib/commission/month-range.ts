/**
 * Limites (inclusivos) de um mes de apuracao, em horario local. O fim do mes vai
 * ate 23:59:59.999 do ultimo dia — usar meia-noite (`new Date(y, m, 0)`) excluia
 * lancamentos com timestamp no ultimo dia (ex.: estorno automatico com
 * `factDate = now`), que ficavam fora do link/exibicao. Fonte unica desta
 * fronteira para todo o modulo de comissao.
 *
 * @param year  ano (ex.: 2026)
 * @param month mes 1-12
 */
export function monthRange(year: number, month: number): { start: Date; end: Date } {
  return {
    start: new Date(year, month - 1, 1, 0, 0, 0, 0),
    end: new Date(year, month, 0, 23, 59, 59, 999),
  };
}
