/**
 * Fuso Brasil (UTC-3, sem horário de verão desde 2019). Ver `date-range.ts`.
 */
const BRT_OFFSET = "-03:00";

/**
 * Limites (inclusivos) de um mes de apuracao, ancorados no fuso Brasil (BRT). O
 * fim do mes vai ate 23:59:59.999 do ultimo dia — usar meia-noite
 * (`new Date(y, m, 0)`) excluia lancamentos com timestamp no ultimo dia (ex.:
 * estorno automatico com `factDate = now`), que ficavam fora do link/exibicao.
 * Fonte unica desta fronteira para todo o modulo de comissao.
 *
 * J3 (auditoria comissão 2026-07-11): a fronteira era `new Date(year, month-1, 1)`,
 * que usa o fuso do PROCESSO. Em prod o container roda UTC → uma venda de
 * 31/jul 22:00 BRT (= 01/ago 01:00 UTC) VAZAVA para agosto e sumia da apuracao
 * de julho; e uma de 30/jun 22:00 BRT entrava em julho. Ancorar em BRT (-03:00)
 * torna o corte independente do fuso do servidor e alinhado ao negocio.
 *
 * @param year  ano (ex.: 2026)
 * @param month mes 1-12
 */
export function monthRange(year: number, month: number): { start: Date; end: Date } {
  const mm = String(month).padStart(2, "0");
  // Ultimo dia do mes em BRT: dia 0 do mes seguinte, calculado em UTC (a
  // aritmetica de dia-do-mes independe do fuso; so o horario e ancorado em BRT).
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const dd = String(lastDay).padStart(2, "0");
  return {
    start: new Date(`${year}-${mm}-01T00:00:00.000${BRT_OFFSET}`),
    end: new Date(`${year}-${mm}-${dd}T23:59:59.999${BRT_OFFSET}`),
  };
}
