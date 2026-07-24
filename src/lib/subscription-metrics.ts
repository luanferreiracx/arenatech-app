/**
 * Métricas de negócio das assinaturas (observabilidade do superadmin). Recebe o
 * resultado de um groupBy(status, billingCycle) e computa MRR + contagem por
 * status. Pura (sem DB) — testável isolada.
 *
 * MRR = receita recorrente MENSAL: assinatura mensal entra pelo valor cheio;
 * anual entra normalizada (/12). Só assinaturas ATIVAS contam para o MRR.
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
  pastDueSubscriptions: number;
  suspendedSubscriptions: number;
} {
  let mrrCents = 0;
  const countByStatus: Record<string, number> = {
    ACTIVE: 0,
    PAST_DUE: 0,
    SUSPENDED: 0,
    CANCELLED: 0,
  };
  for (const row of rows) {
    countByStatus[row.status] = (countByStatus[row.status] ?? 0) + row._count._all;
    if (row.status === "ACTIVE") {
      const sum = row._sum.amountCents ?? 0;
      mrrCents += row.billingCycle === "YEARLY" ? Math.round(sum / 12) : sum;
    }
  }
  return {
    mrrCents,
    activeSubscriptions: countByStatus.ACTIVE ?? 0,
    pastDueSubscriptions: countByStatus.PAST_DUE ?? 0,
    suspendedSubscriptions: countByStatus.SUSPENDED ?? 0,
  };
}
