import { countsAsRevenue } from "@/lib/billing/subscription-status";

/**
 * Métricas de negócio das assinaturas (observabilidade do superadmin). Recebe o
 * resultado de um groupBy(status, billingCycle) e computa MRR + contagem por
 * status. Pura (sem DB) — testável isolada.
 *
 * MRR = receita recorrente MENSAL: assinatura mensal entra pelo valor cheio;
 * anual entra normalizada (/12). Só assinatura PAGA conta — trial e vencida
 * ficam de fora (ver `countsAsRevenue`), e aparecem em contadores próprios.
 */
export type SubscriptionAggRow = {
  status: string;
  billingCycle: string;
  _count: { _all: number };
  _sum: { amountCents: number | null };
};

export function aggregateSubscriptionMetrics(rows: SubscriptionAggRow[]): {
  mrrCents: number;
  activeSubscriptions: number;
  trialingSubscriptions: number;
  pastDueSubscriptions: number;
  suspendedSubscriptions: number;
} {
  let mrrCents = 0;
  const countByStatus: Record<string, number> = {
    TRIALING: 0,
    ACTIVE: 0,
    PAST_DUE: 0,
    SUSPENDED: 0,
    CANCELLED: 0,
  };
  for (const row of rows) {
    countByStatus[row.status] = (countByStatus[row.status] ?? 0) + row._count._all;
    // `countsAsRevenue` em vez de `=== "ACTIVE"`: quando TRIALING entrou, um
    // literal aqui teria somado ao MRR contas que nunca pagaram, e a métrica de
    // saúde do negócio viraria ficção sem ninguém perceber.
    if (countsAsRevenue(row.status)) {
      const sum = row._sum.amountCents ?? 0;
      mrrCents += row.billingCycle === "YEARLY" ? Math.round(sum / 12) : sum;
    }
  }
  return {
    mrrCents,
    activeSubscriptions: countByStatus.ACTIVE ?? 0,
    trialingSubscriptions: countByStatus.TRIALING ?? 0,
    pastDueSubscriptions: countByStatus.PAST_DUE ?? 0,
    suspendedSubscriptions: countByStatus.SUSPENDED ?? 0,
  };
}
