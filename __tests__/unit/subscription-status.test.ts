/**
 * Fonte única do significado de cada status de assinatura (ADR 0061).
 *
 * Existe porque a regra estava copiada em três arquivos: o literal
 * `["ACTIVE","PAST_DUE"]` em `auth.ts` e em `tenant-plan.service.ts`, e um
 * `=== "ACTIVE"` dentro do cálculo de MRR. Quando TRIALING entrou, acertar num
 * lugar e esquecer no outro daria acesso sem receita ou receita sem acesso.
 */
import { describe, it, expect } from "vitest";
import {
  SUBSCRIPTION_STATUSES,
  PLAN_ACCESS_STATUSES,
  grantsPlanAccess,
  countsAsRevenue,
  isTrialing,
} from "@/lib/billing/subscription-status";

describe("grantsPlanAccess", () => {
  it("concede a quem está testando, a quem pagou e a quem está na carência", () => {
    expect(grantsPlanAccess("TRIALING")).toBe(true);
    expect(grantsPlanAccess("ACTIVE")).toBe(true);
    expect(grantsPlanAccess("PAST_DUE")).toBe(true);
  });

  it("nega a suspensa e à cancelada", () => {
    expect(grantsPlanAccess("SUSPENDED")).toBe(false);
    expect(grantsPlanAccess("CANCELLED")).toBe(false);
  });

  it("nega status desconhecido (fail-closed)", () => {
    expect(grantsPlanAccess("QUALQUER_COISA")).toBe(false);
    expect(grantsPlanAccess("")).toBe(false);
  });
});

describe("countsAsRevenue", () => {
  it("só a assinatura paga é receita", () => {
    expect(countsAsRevenue("ACTIVE")).toBe(true);
  });

  it("trial não é receita — contá-lo inflaria o MRR com quem nunca pagou", () => {
    expect(countsAsRevenue("TRIALING")).toBe(false);
  });

  it("vencida não é receita — é receita que não entrou", () => {
    expect(countsAsRevenue("PAST_DUE")).toBe(false);
    expect(countsAsRevenue("SUSPENDED")).toBe(false);
    expect(countsAsRevenue("CANCELLED")).toBe(false);
  });
});

describe("coerência entre acesso e receita", () => {
  it("existe status que dá acesso sem ser receita — é o trial", () => {
    const acessoSemReceita = SUBSCRIPTION_STATUSES.filter(
      (s) => grantsPlanAccess(s) && !countsAsRevenue(s),
    );
    expect(acessoSemReceita).toContain("TRIALING");
    expect(acessoSemReceita).toContain("PAST_DUE");
  });

  it("nenhum status é receita sem dar acesso (cobrar sem entregar)", () => {
    const receitaSemAcesso = SUBSCRIPTION_STATUSES.filter(
      (s) => countsAsRevenue(s) && !grantsPlanAccess(s),
    );
    expect(receitaSemAcesso).toEqual([]);
  });

  it("PLAN_ACCESS_STATUSES e grantsPlanAccess não divergem", () => {
    // A lista existe para virar `where: { status: { in: ... } }` no Prisma. Se
    // ela e a função discordarem, o banco filtra diferente do código.
    const pelaFuncao = SUBSCRIPTION_STATUSES.filter(grantsPlanAccess);
    expect([...pelaFuncao].sort()).toEqual([...PLAN_ACCESS_STATUSES].sort());
  });
});

describe("isTrialing", () => {
  it("distingue teste de assinatura paga", () => {
    expect(isTrialing("TRIALING")).toBe(true);
    expect(isTrialing("ACTIVE")).toBe(false);
  });
});
