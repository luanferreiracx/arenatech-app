/**
 * Faixas de filtro por período, separando as DUAS semânticas de data que o
 * sistema guarda na mesma forma (`timestamp` sem fuso) e que os filtros vinham
 * tratando como se fossem uma só.
 *
 * **Data pura** — `emissionDate`, `dueDate`: o app grava meia-noite UTC porque
 * o que importa é o DIA, não o instante. Medido em produção (2026-07-29): 709
 * de 777 emissões estão exatamente em `00:00:00`.
 *
 * **Instante** — `paidAt`, `settledAt`, `createdAt`: hora de verdade, do fuso de
 * quem operou. 1.360 de 1.716 pagamentos têm hora.
 *
 * A diferença importa e é contraintuitiva: aplicar BRT numa data pura
 * **exclui** o próprio dia (meia-noite UTC < 03:00Z, que é o início do dia BRT),
 * enquanto deixar uma data-instante no construtor cru perde o que aconteceu
 * depois das 21h. Cada uma precisa da sua faixa.
 */
import { startOfDayBrt, endOfDayBrt } from "@/lib/utils/date-range";

export interface DateRangeFilter {
  gte?: Date;
  lte?: Date;
  lt?: Date;
}

/**
 * Faixa para coluna de **data pura** (gravada à meia-noite UTC).
 *
 * `[dia 00:00Z, dia_seguinte 00:00Z)` — meio-aberto, para incluir o dia inteiro
 * sem depender do fuso do processo. `setHours(23,59,59)` fazia isso variar
 * conforme o servidor.
 */
export function pureDateRange(from?: string | null, to?: string | null): DateRangeFilter {
  const range: DateRangeFilter = {};
  if (from) range.gte = new Date(`${from}T00:00:00.000Z`);
  if (to) {
    const next = new Date(`${to}T00:00:00.000Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    range.lt = next;
  }
  return range;
}

/** Faixa para coluna de **instante**, ancorada no dia BRT de quem opera. */
export function instantRange(from?: string | null, to?: string | null): DateRangeFilter {
  const range: DateRangeFilter = {};
  if (from) range.gte = startOfDayBrt(from);
  if (to) range.lte = endOfDayBrt(to);
  return range;
}
