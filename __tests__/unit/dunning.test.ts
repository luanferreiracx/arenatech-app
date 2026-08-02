/**
 * Quais avisos de cobrança são devidos hoje (ADR 0061).
 *
 * O defeito de origem: nada avisava o cliente em ponto algum do funil de
 * billing. Ele descobria a suspensão ao tentar trabalhar.
 */
import { describe, it, expect } from "vitest";
import {
  dueNotices,
  daysUntil,
  DUE_SOON_WINDOW_DAYS,
  GRACE_ENDING_WINDOW_DAYS,
} from "@/lib/billing/dunning";

const GRACE = 5;
const now = new Date("2026-07-10T12:00:00.000Z");
const daysFromNow = (days: number) =>
  new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

describe("daysUntil", () => {
  it("conta em instantes, não em dias do calendário local", () => {
    expect(daysUntil(daysFromNow(3), now)).toBe(3);
    expect(daysUntil(daysFromNow(-2), now)).toBe(-2);
  });

  // Guardião do bug de fuso que zerou a ajuda de custo: o container roda em UTC,
  // e extrair dia com getDate() daria resultado diferente do fuso do usuário.
  it("não muda de resultado conforme o fuso do processo", () => {
    const target = new Date("2026-07-13T02:00:00.000Z"); // 23h do dia 12 em BRT
    expect(daysUntil(target, now)).toBe(3);
  });
});

describe("dueNotices", () => {
  it("ACTIVE dentro da janela: avisa que vence em breve", () => {
    expect(
      dueNotices({ status: "ACTIVE", currentPeriodEnd: daysFromNow(DUE_SOON_WINDOW_DAYS), now, graceDays: GRACE }),
    ).toEqual(["DUE_SOON"]);
    expect(
      dueNotices({ status: "ACTIVE", currentPeriodEnd: daysFromNow(1), now, graceDays: GRACE }),
    ).toEqual(["DUE_SOON"]);
  });

  it("ACTIVE longe do vencimento: não avisa nada", () => {
    expect(
      dueNotices({ status: "ACTIVE", currentPeriodEnd: daysFromNow(DUE_SOON_WINDOW_DAYS + 1), now, graceDays: GRACE }),
    ).toEqual([]);
    expect(
      dueNotices({ status: "ACTIVE", currentPeriodEnd: daysFromNow(30), now, graceDays: GRACE }),
    ).toEqual([]);
  });

  it("ACTIVE já vencida NÃO recebe 'vence em breve'", () => {
    // Esse caso é do cron de vencimento, que a leva a PAST_DUE no mesmo passo.
    // Dizer "vence em breve" para quem já venceu é a mensagem errada.
    expect(
      dueNotices({ status: "ACTIVE", currentPeriodEnd: daysFromNow(-1), now, graceDays: GRACE }),
    ).toEqual([]);
  });

  it("PAST_DUE no começo da carência: avisa que venceu, sem falar em suspensão", () => {
    expect(
      dueNotices({ status: "PAST_DUE", currentPeriodEnd: daysFromNow(-1), now, graceDays: GRACE }),
    ).toEqual(["PAST_DUE"]);
  });

  it("PAST_DUE na véspera da suspensão: avisa os dois", () => {
    // Vencimento há 4 dias, carência 5 → suspende amanhã.
    const notices = dueNotices({
      status: "PAST_DUE",
      currentPeriodEnd: daysFromNow(-(GRACE - GRACE_ENDING_WINDOW_DAYS)),
      now,
      graceDays: GRACE,
    });
    expect(notices).toContain("PAST_DUE");
    expect(notices).toContain("GRACE_ENDING");
  });

  // O teste grátis tem aviso PRÓPRIO. Quem está testando ainda não escolheu
  // plano nem tem o que pagar: "sua assinatura vence" seria a frase errada no
  // momento mais decisivo do funil.
  it("teste grátis acabando: avisa o fim do TESTE, não um vencimento", () => {
    const notices = dueNotices({
      status: "TRIALING",
      currentPeriodEnd: daysFromNow(2),
      now,
      graceDays: GRACE,
    });
    expect(notices).toEqual(["TRIAL_ENDING"]);
    expect(notices).not.toContain("DUE_SOON");
  });

  it("teste longe do fim: não avisa nada", () => {
    expect(
      dueNotices({ status: "TRIALING", currentPeriodEnd: daysFromNow(6), now, graceDays: GRACE }),
    ).toEqual([]);
  });

  it("teste que já acabou não recebe 'está acabando'", () => {
    // Esse caso é do cron de vencimento, que leva o trial a PAST_DUE no mesmo passo.
    expect(
      dueNotices({ status: "TRIALING", currentPeriodEnd: daysFromNow(-1), now, graceDays: GRACE }),
    ).toEqual([]);
  });

  it("SUSPENDED: avisa que suspendemos", () => {
    expect(
      dueNotices({ status: "SUSPENDED", currentPeriodEnd: daysFromNow(-30), now, graceDays: GRACE }),
    ).toEqual(["SUSPENDED"]);
  });

  it("CANCELLED: não persegue quem já saiu", () => {
    expect(
      dueNotices({ status: "CANCELLED", currentPeriodEnd: daysFromNow(-1), now, graceDays: GRACE }),
    ).toEqual([]);
  });

  it("carência zero: PAST_DUE já cai na véspera", () => {
    const notices = dueNotices({
      status: "PAST_DUE",
      currentPeriodEnd: daysFromNow(-1),
      now,
      graceDays: 0,
    });
    expect(notices).toContain("GRACE_ENDING");
  });
});
