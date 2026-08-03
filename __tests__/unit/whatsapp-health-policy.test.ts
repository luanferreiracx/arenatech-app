/**
 * Política da verificação periódica de credenciais do WhatsApp Cloud.
 *
 * Lógica PURA, separada do cron e do banco, porque é aqui que mora a decisão
 * difícil: QUANDO avisar. O projeto já pagou por errar isso — um alarme cujo
 * limiar era menor que o próprio ciclo disparava em 100% das execuções, e o
 * aviso virou ruído que ninguém lia.
 *
 * As duas regras que este módulo existe para garantir:
 *
 * 1. **Não repetir.** Credencial quebrada continua quebrada amanhã; avisar todo
 *    dia treina o dono a ignorar.
 * 2. **Avisar de novo quando o problema MUDA.** Token expirado que vira número
 *    não-verificado é outro problema, com outra ação — silenciar seria pior que
 *    repetir.
 */
import { describe, it, expect } from "vitest";
import {
  shouldNotifyBrokenCredential,
  shouldNotifyRecovery,
} from "@/lib/services/whatsapp-health-policy";

const AGORA = new Date("2026-08-03T12:00:00Z");
const HORAS = (n: number) => new Date(AGORA.getTime() - n * 60 * 60 * 1000);

describe("quando avisar que a credencial quebrou", () => {
  it("avisa na primeira vez que o problema aparece", () => {
    const decisao = shouldNotifyBrokenCredential({
      now: AGORA,
      reason: "invalid_token",
      previousReason: null,
      notifiedAt: null,
    });
    expect(decisao.notify).toBe(true);
  });

  it("NÃO repete o mesmo aviso no dia seguinte", () => {
    // A credencial continua quebrada e o motivo é o mesmo. Repetir treina o
    // dono a ignorar o alerta — e no dia em que quebrar outra coisa, ele não lê.
    const decisao = shouldNotifyBrokenCredential({
      now: AGORA,
      reason: "invalid_token",
      previousReason: "invalid_token",
      notifiedAt: HORAS(24),
    });
    expect(decisao.notify).toBe(false);
  });

  it("avisa DE NOVO quando o motivo muda", () => {
    // Token expirado → número não verificado é outro problema, com outra ação.
    // Silenciar por já ter avisado do anterior esconderia o novo.
    const decisao = shouldNotifyBrokenCredential({
      now: AGORA,
      reason: "phone_not_verified",
      previousReason: "invalid_token",
      notifiedAt: HORAS(2),
    });
    expect(decisao.notify).toBe(true);
  });
});

describe("quando a credencial VOLTA a funcionar", () => {
  it("avisa a recuperação — mas só para quem foi avisado da quebra", () => {
    // Sem isto, o dono fica com a última notícia sendo "seu bot está fora" e
    // não sabe que já voltou. Avisar recuperação de quem nunca soube da quebra
    // seria ruído sobre um problema que ele nem viu.
    const recuperou = shouldNotifyRecovery({ previouslyNotified: true });
    expect(recuperou.notify).toBe(true);

    const nuncaSoube = shouldNotifyRecovery({ previouslyNotified: false });
    expect(nuncaSoube.notify).toBe(false);
  });
});
