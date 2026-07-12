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

/** Dias de carência padrão após o vencimento antes de suspender (cortar acesso). */
export const DEFAULT_GRACE_DAYS = 5;

/**
 * Data-limite da carência: assinaturas cujo vencimento (`currentPeriodEnd`) é
 * anterior a este instante já esgotaram os `graceDays` e devem ser suspensas.
 * Ex.: now=10/jul, graceDays=5 → limite=05/jul; venceu antes de 05/jul → suspende.
 */
export function graceCutoff(now: Date, graceDays: number): Date {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - graceDays);
  return cutoff;
}
