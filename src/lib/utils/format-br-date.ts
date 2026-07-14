// `YYYY-MM-DD` puro (data de negocio, sem hora). Ex.: "2026-07-01".
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Formata uma data para `DD/MM/YYYY` (pt-BR).
 *
 * Datas `YYYY-MM-DD` (sem hora) sao formatadas POR PARTES — `new Date("2026-07-01")`
 * as interpreta como UTC meia-noite e, num locale/servidor em BRT (UTC-3), o
 * `toLocaleDateString` recua um dia (mostrava 30/06 para 01/07). Timestamps
 * (objeto `Date` ou string com hora) seguem no locale normal.
 */
export function formatBrDate(date: string | Date | null | undefined): string {
  if (!date) return "—";
  if (typeof date === "string") {
    if (DATE_ONLY.test(date)) {
      const [year, month, day] = date.split("-");
      return `${day}/${month}/${year}`;
    }
    return new Date(date).toLocaleDateString("pt-BR");
  }
  return date.toLocaleDateString("pt-BR");
}
