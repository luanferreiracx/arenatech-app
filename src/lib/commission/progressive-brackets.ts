/**
 * Faixas progressivas estilo IR: cada porcao da base recebe a aliquota da sua
 * faixa. Nucleo financeiro da comissao do prestador — puro, sem dependencia de
 * servidor, para ser testavel isoladamente. Paridade com
 * ComissaoEngine::aplicarFaixasProgressivas (Laravel).
 */
export function applyProgressiveBrackets(
  baseTotal: number,
  rules: Array<{ rangeMin: number; rangeMax: number | null; rate: number }>,
): number {
  let commission = 0;

  for (const rule of rules) {
    const cap = rule.rangeMax ?? Number.MAX_SAFE_INTEGER;
    const topApplicable = Math.min(baseTotal, cap);
    const portion = Math.max(0, topApplicable - rule.rangeMin);
    if (portion <= 0) continue;

    commission += portion * (rule.rate / 100);
  }

  return Math.round(commission * 100) / 100;
}
