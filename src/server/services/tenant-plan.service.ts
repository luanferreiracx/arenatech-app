import type { Prisma } from "@prisma/client";

/**
 * Resolve o PLANO EFETIVO de um tenant (fonte única de verdade).
 *
 * Fonte canônica = a `Subscription` não-cancelada do tenant (ACTIVE ou PAST_DUE
 * — em carência ainda tem acesso). Fallback = `Tenant.plan` (coluna sombra) para
 * o legado ainda sem Subscription durante a transição da unificação.
 *
 * Recebe um client admin (tabelas globais `subscriptions`/`plans`/`tenants` não
 * têm RLS de tenant — o caller passa `withAdmin`/`tx`). Retorna `null` quando o
 * tenant não tem plano por nenhuma das fontes (ex.: NO-KYC sem plano ativo).
 */
export async function resolveTenantPlan(
  tx: Prisma.TransactionClient,
  tenantId: string,
): Promise<{ id: string; maxUsers: number; maxImeiQueries: number; features: Prisma.JsonValue } | null> {
  const subscription = await tx.subscription.findFirst({
    where: { tenantId, status: { in: ["ACTIVE", "PAST_DUE"] } },
    select: {
      plan: {
        select: { id: true, maxUsers: true, maxImeiQueries: true, features: true },
      },
    },
  });
  if (subscription) return subscription.plan;

  // Fallback legado: `Tenant.plan` guarda o id do plano (após o saneamento da
  // migration, nunca mais slug/lixo). Só usado enquanto houver tenant sem Subscription.
  const tenant = await tx.tenant.findUnique({
    where: { id: tenantId },
    select: { plan: true },
  });
  if (!tenant?.plan) return null;

  return tx.plan.findUnique({
    where: { id: tenant.plan },
    select: { id: true, maxUsers: true, maxImeiQueries: true, features: true },
  });
}
