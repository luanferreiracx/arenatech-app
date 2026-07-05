import type { BillingCycle } from "@/lib/validators/subscription";

/**
 * Lógica pura de billing manual da assinatura (Fase 2). Sem dependências de
 * banco/server para ser testável isoladamente.
 */

/**
 * Próximo vencimento ao marcar a assinatura como paga: avança 1 ciclo a partir
 * do vencimento atual quando ainda no futuro (renovação antecipada não perde
 * dias), ou a partir de `now` quando já vencida/sem vencimento (não credita
 * período retroativo).
 */
export function nextPeriodEnd(args: {
  cycle: BillingCycle;
  currentPeriodEnd: Date | null | undefined;
  now: Date;
}): Date {
  const base =
    args.currentPeriodEnd && args.currentPeriodEnd > args.now
      ? args.currentPeriodEnd
      : args.now;
  const next = new Date(base);
  if (args.cycle === "YEARLY") {
    next.setFullYear(next.getFullYear() + 1);
    return next;
  }
  next.setMonth(next.getMonth() + 1);
  return next;
}

/**
 * Snapshot do valor da assinatura (centavos) a partir do preço do plano no ciclo
 * escolhido. Plano anual sem `yearlyPrice` cai para 12× o mensal.
 */
export function snapshotAmountCents(args: {
  cycle: BillingCycle;
  monthlyCents: number;
  yearlyCents: number | null;
}): number {
  if (args.cycle === "YEARLY") {
    return args.yearlyCents ?? args.monthlyCents * 12;
  }
  return args.monthlyCents;
}
