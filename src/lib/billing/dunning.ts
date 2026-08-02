/**
 * Quais avisos de cobrança são devidos HOJE para uma assinatura (ADR 0061).
 *
 * Lógica pura, sem banco nem envio. A idempotência (não avisar o mesmo duas
 * vezes) não mora aqui: é a tabela `subscription_notifications`, com chave
 * única (assinatura, tipo, vencimento). Esta função só responde "o que se aplica
 * agora"; chamar todo dia é seguro.
 *
 * Toda a aritmética é em MILISSEGUNDOS de propósito. Extrair dia com `getDate()`
 * lê no fuso do processo, que em produção é UTC — foi assim que a ajuda de custo
 * zerou um mês inteiro por um dia de falta. Diferença de instantes não tem fuso.
 */

export const SUBSCRIPTION_NOTICE_KINDS = [
  "DUE_SOON",
  "PAST_DUE",
  "GRACE_ENDING",
  "SUSPENDED",
] as const;

export type SubscriptionNoticeKind = (typeof SUBSCRIPTION_NOTICE_KINDS)[number];

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Quantos dias faltam para `target` (arredondado para cima; passado = negativo). */
export function daysUntil(target: Date, now: Date): number {
  return Math.ceil((target.getTime() - now.getTime()) / MS_PER_DAY);
}

/** Janela do aviso preventivo: avisa quando faltam ATÉ tantos dias. */
export const DUE_SOON_WINDOW_DAYS = 3;

/** Aviso de véspera: dispara quando falta ATÉ tanto para a suspensão. */
export const GRACE_ENDING_WINDOW_DAYS = 1;

/**
 * Avisos aplicáveis agora. Um mesmo dia pode render mais de um (ex.: a
 * assinatura já vencida cuja carência termina amanhã).
 */
export function dueNotices(args: {
  status: string;
  currentPeriodEnd: Date;
  now: Date;
  graceDays: number;
}): SubscriptionNoticeKind[] {
  const { status, currentPeriodEnd, now, graceDays } = args;

  if (status === "CANCELLED") return [];
  if (status === "SUSPENDED") return ["SUSPENDED"];

  if (status === "PAST_DUE") {
    const notices: SubscriptionNoticeKind[] = ["PAST_DUE"];
    const suspendsAt = new Date(currentPeriodEnd.getTime() + graceDays * MS_PER_DAY);
    if (daysUntil(suspendsAt, now) <= GRACE_ENDING_WINDOW_DAYS) {
      notices.push("GRACE_ENDING");
    }
    return notices;
  }

  if (status === "ACTIVE") {
    const remaining = daysUntil(currentPeriodEnd, now);
    // `> 0` exclui a já vencida: essa é caso do cron de vencimento, que a leva a
    // PAST_DUE no mesmo passo. Avisar "vence em breve" para quem já venceu seria
    // a mensagem errada.
    if (remaining > 0 && remaining <= DUE_SOON_WINDOW_DAYS) return ["DUE_SOON"];
    return [];
  }

  return [];
}
