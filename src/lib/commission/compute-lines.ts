import type { Prisma } from "@prisma/client";
import { computeBucketCommission } from "@/lib/commission/bucket-commission";

/**
 * Evento comissionavel ja normalizado (venda/OS/participacao). Espelha o que
 * `collectProviderEvents` produz — so os campos que o calculo dos baldes usa.
 */
export type CommissionEvent = {
  tipo: string;
  referencia_id: string;
  referencia_label: string;
  data: string;
  categoria: string;
  escopo: string;
  category: string;
  scope: string;
  source: string;
  base: number;
  baseProfit: number;
  baseGrossNet: number;
  qty: number;
  detalhe: Record<string, unknown>;
};

/** Regra de comissao ja com os Decimals convertidos para number. */
export type CommissionRuleNumeric = {
  category: string;
  scope: string;
  source: string;
  valueType: string;
  base: string;
  rangeMin: number;
  rangeMax: number | null;
  rate: number;
};

/** Linha final: evento + a comissao calculada e a origem do balde. */
export type CommissionLine = CommissionEvent & {
  comissao: number;
  aliquota_efetiva: number;
  tipo_valor: string;
  origem: string;
};

function decimalToNumber(v: Prisma.Decimal | number | null | undefined): number {
  if (v == null) return 0;
  return Number(v);
}

/**
 * Converte as regras cruas do contrato (Decimals) para a forma numerica usada
 * pelo motor de baldes. Fonte unica dessa conversao.
 */
export function toNumericRules(
  rules: Array<{
    category: string;
    scope: string;
    source: string;
    valueType: string;
    base: string;
    rangeMin: Prisma.Decimal | number;
    rangeMax: Prisma.Decimal | number | null;
    rate: Prisma.Decimal | number;
  }>,
): CommissionRuleNumeric[] {
  return rules.map((r) => ({
    category: r.category,
    scope: r.scope,
    source: r.source,
    valueType: r.valueType,
    base: r.base,
    rangeMin: decimalToNumber(r.rangeMin),
    rangeMax: r.rangeMax != null ? decimalToNumber(r.rangeMax) : null,
    rate: decimalToNumber(r.rate),
  }));
}

/**
 * Agrupa eventos em baldes (categoria × escopo × origem), aplica as regras
 * correspondentes e devolve uma linha por evento comissionado + a comissao
 * bruta total. Puro — nenhum acesso a banco. Compartilhado pela apuracao mensal
 * persistida (`recomputeProviderApuracao`) e pela previa por periodo livre, para
 * que a matematica nao divirja entre as duas.
 */
export function computeCommissionLines(
  events: CommissionEvent[],
  rules: CommissionRuleNumeric[],
): { lines: CommissionLine[]; grossCommission: number } {
  const buckets: Record<
    string,
    { category: string; scope: string; source: string; events: CommissionEvent[] }
  > = {};
  for (const ev of events) {
    const key = `${ev.category}|${ev.scope}|${ev.source}`;
    if (!buckets[key]) {
      buckets[key] = { category: ev.category, scope: ev.scope, source: ev.source, events: [] };
    }
    buckets[key]!.events.push(ev);
  }

  const lines: CommissionLine[] = [];
  for (const bucket of Object.values(buckets)) {
    const matchingRules = rules.filter(
      (r) => r.category === bucket.category && r.scope === bucket.scope && r.source === bucket.source,
    );
    if (matchingRules.length === 0) continue;
    const results = computeBucketCommission(matchingRules, bucket.events);
    bucket.events.forEach((ev, i) => {
      const r = results[i]!;
      lines.push({
        ...ev,
        base: r.base,
        comissao: r.comissao,
        aliquota_efetiva: r.aliquotaEfetiva,
        tipo_valor: r.tipoValor,
        origem: bucket.source,
      });
    });
  }

  const grossCommission = Math.round(lines.reduce((s, l) => s + l.comissao, 0) * 100) / 100;
  return { lines, grossCommission };
}

export type CommissionSubtotal = {
  categoria: string;
  escopo: string;
  origem: string;
  base: number;
  comissao: number;
  qtd: number;
};

/**
 * Subtotais por balde (categoria × escopo × origem), reduzidos a partir das
 * linhas ja calculadas. Chaveado por `categoria|escopo|origem` — igual ao que a
 * `memoryJson` da apuracao mensal gravava.
 */
export function summarizeCommissionLines(
  lines: CommissionLine[],
): Record<string, CommissionSubtotal> {
  const subtotals: Record<string, CommissionSubtotal> = {};
  for (const l of lines) {
    const key = `${l.categoria}|${l.escopo}|${l.origem}`;
    const acc = subtotals[key] ?? {
      categoria: l.categoria,
      escopo: l.escopo,
      origem: l.origem,
      base: 0,
      comissao: 0,
      qtd: 0,
    };
    acc.base = Math.round((acc.base + l.base) * 100) / 100;
    acc.comissao = Math.round((acc.comissao + l.comissao) * 100) / 100;
    acc.qtd += 1;
    subtotals[key] = acc;
  }
  return subtotals;
}
