/**
 * Adiciona N meses a uma data preservando o dia até o limite do mês alvo.
 * Ex: addMonthsSafe(2026-01-31, 1) = 2026-02-28 (não 2026-03-03 como o setMonth
 * nativo, que transborda). Equivale ao Carbon addMonthsNoOverflow do PHP.
 *
 * Fonte única de deslocamento mensal de vencimento — usada tanto pela geração
 * de parcelas (installment-generator) quanto pelo router financeiro.
 */
export function addMonthsSafe(base: Date, months: number): Date {
  const d = new Date(base);
  const targetDay = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const lastDayOfTargetMonth = new Date(
    d.getFullYear(),
    d.getMonth() + 1,
    0,
  ).getDate();
  d.setDate(Math.min(targetDay, lastDayOfTargetMonth));
  return d;
}
