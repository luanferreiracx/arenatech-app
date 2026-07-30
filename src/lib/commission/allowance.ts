/**
 * Ajuda de custo do prestador no periodo.
 *
 * Os campos sao VALORES TOTAIS DO MES (nao diarias): refeicao, deslocamento e
 * celular. Os tres sao pagos proporcionalmente aos dias efetivos (mes menos os
 * dias nao cobertos), e o total e limitado pelo teto (`cap`; 0 = sem teto).
 * Puro — sem dependencia de servidor, testavel isoladamente.
 *
 * @param meal        valor de refeicao no MES (R$)
 * @param transport   valor de deslocamento no MES (R$)
 * @param cellphone   valor de celular no MES (R$)
 * @param cap         teto do total (R$); <= 0 = sem teto
 * @param daysInMonth total de dias do mes (ex.: 30)
 * @param uncoveredDays dias nao cobertos (o prestador nao atuou)
 */
export function calcAllowance(args: {
  meal: number;
  transport: number;
  cellphone: number;
  cap: number;
  daysInMonth: number;
  uncoveredDays: number;
}): number {
  return calcAllowanceBreakdown(args).total;
}

/**
 * Mesmo cálculo, devolvendo também **quanto o teto cortou**.
 *
 * `ProviderApuracao.capReduction` existe no schema e é exibido na ficha do
 * prestador, mas nenhum código o escrevia: a tela mostrava "R$ 0,00" mesmo
 * quando o teto tinha cortado a ajuda de custo, e o prestador não tinha como
 * saber por que recebeu menos. O corte é decidido aqui, então é aqui que ele é
 * medido — calcular de novo do outro lado seria a segunda implementação.
 */
export function calcAllowanceBreakdown(args: {
  meal: number;
  transport: number;
  cellphone: number;
  cap: number;
  daysInMonth: number;
  uncoveredDays: number;
}): { total: number; capReduction: number } {
  const { meal, transport, cellphone, cap, daysInMonth, uncoveredDays } = args;
  if (daysInMonth <= 0) return { total: 0, capReduction: 0 };

  const effectiveDays = Math.max(0, daysInMonth - Math.max(0, uncoveredDays));
  const proportion = effectiveDays / daysInMonth;

  const total = (meal + transport + cellphone) * proportion;
  const limited = cap > 0 ? Math.min(total, cap) : total;
  return {
    total: Math.round(limited * 100) / 100,
    capReduction: Math.round((total - limited) * 100) / 100,
  };
}
