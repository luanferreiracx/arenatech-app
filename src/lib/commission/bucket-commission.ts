import { applyProgressiveBrackets } from "@/lib/commission/progressive-brackets";

export type BucketRule = {
  valueType: string; // "PERCENT" | "FIXED_PER_UNIT"
  base: string; // "PROFIT" | "GROSS_NET"
  rangeMin: number;
  rangeMax: number | null;
  rate: number; // % (PERCENT) ou R$/unidade (FIXED_PER_UNIT)
};

export type BucketEvent = {
  baseProfit: number;
  baseGrossNet: number;
  qty: number;
};

export type BucketLineResult = {
  base: number; // a base efetivamente usada (lucro ou total), por evento
  comissao: number;
  aliquotaEfetiva: number;
  tipoValor: string;
};

/**
 * Calcula a comissao de um balde (categoria × escopo × origem) e rateia entre os
 * eventos, retornando uma linha por evento (mesma ordem de entrada). Puro —
 * sem dependencia de servidor, testavel isoladamente.
 *
 * Regras do balde (`rules`) compartilham categoria/escopo/origem. O modo
 * (tipo/base) e lido da 1a regra (o validador garante um modo por balde):
 *  - PERCENT: faixas progressivas sobre a base (lucro ou total liquido) do balde.
 *  - FIXED_PER_UNIT: R$ rate × quantidade, por evento (sem faixa).
 */
export function computeBucketCommission(
  rules: BucketRule[],
  events: BucketEvent[],
): BucketLineResult[] {
  if (rules.length === 0 || events.length === 0) return [];

  const sorted = [...rules].sort((a, b) => a.rangeMin - b.rangeMin);
  const mode = sorted[0]!;
  const useGrossNet = mode.base === "GROSS_NET";
  const baseOf = (ev: BucketEvent) => (useGrossNet ? ev.baseGrossNet : ev.baseProfit);

  if (mode.valueType === "FIXED_PER_UNIT") {
    const perUnit = mode.rate;
    return events.map((ev) => ({
      base: baseOf(ev),
      comissao: Math.round(perUnit * ev.qty * 100) / 100,
      aliquotaEfetiva: 0,
      tipoValor: "FIXED_PER_UNIT",
    }));
  }

  const baseTotal = Math.round(events.reduce((s, ev) => s + baseOf(ev), 0) * 100) / 100;
  const totalCommission = applyProgressiveBrackets(baseTotal, sorted);

  return events.map((ev) => {
    const evBase = baseOf(ev);
    const proportion = baseTotal > 0 ? evBase / baseTotal : 0;
    const comissao = Math.round(totalCommission * proportion * 100) / 100;
    const aliquotaEfetiva = evBase > 0 ? Math.round((comissao / evBase) * 10000) / 100 : 0;
    return { base: evBase, comissao, aliquotaEfetiva, tipoValor: "PERCENT" };
  });
}
