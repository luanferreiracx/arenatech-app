/**
 * C8 — métricas de assinatura do superadmin (MRR + contagem por status).
 */
import { describe, it, expect } from "vitest";
import { aggregateSubscriptionMetrics } from "@/lib/subscription-metrics";

const row = (status: string, billingCycle: string, count: number, sum: number) => ({
  status,
  billingCycle,
  _count: { _all: count },
  _sum: { amountCents: sum },
});

describe("aggregateSubscriptionMetrics", () => {
  it("MRR: mensal pelo valor cheio; anual normalizada (/12); só ATIVAS contam", () => {
    const m = aggregateSubscriptionMetrics([
      row("ACTIVE", "MONTHLY", 2, 10000), // 2 assinaturas somam R$100 → +10000
      row("ACTIVE", "YEARLY", 1, 12000), // R$120/ano → +1000/mês
      row("PAST_DUE", "MONTHLY", 1, 5000), // não conta no MRR
      row("CANCELLED", "MONTHLY", 3, 9000), // não conta
    ]);
    expect(m.mrrCents).toBe(11000);
  });

  it("conta assinaturas por status", () => {
    const m = aggregateSubscriptionMetrics([
      row("ACTIVE", "MONTHLY", 5, 5000),
      row("PAST_DUE", "MONTHLY", 2, 2000),
      row("SUSPENDED", "YEARLY", 1, 1200),
    ]);
    expect(m.activeSubscriptions).toBe(5);
    expect(m.pastDueSubscriptions).toBe(2);
    expect(m.suspendedSubscriptions).toBe(1);
  });

  it("sem assinaturas: tudo zero", () => {
    const m = aggregateSubscriptionMetrics([]);
    expect(m).toEqual({
      mrrCents: 0,
      activeSubscriptions: 0,
      pastDueSubscriptions: 0,
      suspendedSubscriptions: 0,
    });
  });

  it("_sum nulo (grupo sem valores) não quebra", () => {
    const m = aggregateSubscriptionMetrics([
      { status: "ACTIVE", billingCycle: "MONTHLY", _count: { _all: 1 }, _sum: { amountCents: null } },
    ]);
    expect(m.mrrCents).toBe(0);
    expect(m.activeSubscriptions).toBe(1);
  });
});
