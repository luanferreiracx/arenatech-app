import type { Prisma } from "@prisma/client";
import { graceCutoff } from "@/lib/billing/subscription";

export type SubscriptionExpiryResult = {
  markedPastDue: number;
  suspended: number;
  suspendedTenantIds: string[];
};

/**
 * Transições de vencimento da assinatura, numa única transação admin:
 *   1. TRIALING/ACTIVE com `currentPeriodEnd < now` → PAST_DUE (mantém acesso na
 *      carência). O fim do teste grátis usa este mesmo caminho.
 *   2. PAST_DUE cujo vencimento passou de `graceDays` → SUSPENDED, e o Tenant a
 *      SUSPENDED (bloqueio suave — ADR 0061, não expulsa).
 *
 * Isolada do route handler (que só faz auth + lock) para ser testável contra o
 * banco sem puxar `next/server`.
 */
export async function runSubscriptionExpiry(
  tx: Prisma.TransactionClient,
  args: { now: Date; graceDays: number },
): Promise<SubscriptionExpiryResult> {
  const { now, graceDays } = args;
  const cutoff = graceCutoff(now, graceDays);

  // `TRIALING` entra junto com `ACTIVE` (ADR 0061): o fim do teste é o mesmo
  // campo do vencimento, então o teste que acaba percorre o caminho já existente
  // — carência e depois bloqueio. Sem máquina de estados paralela para trial.
  const markedPastDue = await tx.subscription.updateMany({
    where: { status: { in: ["TRIALING", "ACTIVE"] }, currentPeriodEnd: { lt: now } },
    data: { status: "PAST_DUE" },
  });

  const toSuspend = await tx.subscription.findMany({
    where: { status: "PAST_DUE", currentPeriodEnd: { lt: cutoff } },
    select: { id: true, tenantId: true },
  });
  const suspendedTenantIds = toSuspend.map((s) => s.tenantId);

  let suspended = 0;
  if (suspendedTenantIds.length > 0) {
    const result = await tx.subscription.updateMany({
      where: { id: { in: toSuspend.map((s) => s.id) } },
      data: { status: "SUSPENDED", cancelReason: "Vencida além da carência" },
    });
    await tx.tenant.updateMany({
      where: { id: { in: suspendedTenantIds }, status: "ACTIVE" },
      data: { status: "SUSPENDED" },
    });
    suspended = result.count;
  }

  return { markedPastDue: markedPastDue.count, suspended, suspendedTenantIds };
}
