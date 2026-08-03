/**
 * Quando avisar que a credencial do WhatsApp Cloud de um tenant quebrou.
 *
 * Lógica PURA, fora do cron e do banco, porque é a decisão difícil da
 * verificação periódica — e a que este projeto já errou. Um alarme cujo limiar
 * era menor que o próprio ciclo disparava em 100% das execuções; o aviso virou
 * ruído e ninguém leu. A regra aqui é o oposto: falar UMA vez por problema.
 *
 * Duas garantias:
 *
 * 1. **Não repetir.** Credencial quebrada continua quebrada amanhã. Avisar todo
 *    dia treina o dono a ignorar — e no dia em que quebrar outra coisa, ele não
 *    lê.
 * 2. **Falar de novo quando o problema MUDA.** Token expirado que vira número
 *    não-verificado é outro problema, com outra ação. Silenciar por já ter
 *    avisado do anterior esconderia o novo.
 */

export type BrokenCredentialContext = {
  now: Date;
  /** Motivo da falha AGORA (`CloudCredentialFailureReason`). */
  reason: string;
  /** Motivo registrado na verificação anterior, ou `null` se nunca falhou. */
  previousReason: string | null;
  /** Quando o último aviso saiu, ou `null` se nunca avisamos. */
  notifiedAt: Date | null;
};

export type NotifyDecision = {
  notify: boolean;
  /** Por que decidimos assim — vai para o log, para o dia em que alguém perguntar. */
  rationale: "first_failure" | "reason_changed" | "already_notified";
};

export function shouldNotifyBrokenCredential(ctx: BrokenCredentialContext): NotifyDecision {
  // Nunca avisamos sobre esta credencial: fala.
  if (!ctx.notifiedAt) {
    return { notify: true, rationale: "first_failure" };
  }

  // O problema é outro: fala de novo, porque a ação para resolver é outra.
  if (ctx.reason !== ctx.previousReason) {
    return { notify: true, rationale: "reason_changed" };
  }

  // Mesmo problema, já avisado. Silêncio — é o que separa alerta de ruído.
  return { notify: false, rationale: "already_notified" };
}

/**
 * A credencial voltou a funcionar: avisar?
 *
 * Só para quem foi avisado da quebra. Sem isto, a última notícia que o dono
 * recebeu é "seu bot está fora" e ele não fica sabendo que já voltou — o que o
 * leva a mexer numa configuração que estava certa. Avisar recuperação de quem
 * nunca soube da quebra seria ruído sobre um problema que ele não viu.
 */
export function shouldNotifyRecovery(input: { previouslyNotified: boolean }): {
  notify: boolean;
} {
  return { notify: input.previouslyNotified };
}
