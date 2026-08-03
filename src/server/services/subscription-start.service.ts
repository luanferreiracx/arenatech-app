/**
 * Abertura de assinatura — a operação que dá a um tenant o plano dele.
 *
 * Existe como serviço, e não como corpo de um procedure, porque DOIS caminhos
 * precisam dela e precisam concordar:
 *
 *   1. `admin.activateSubscription` — o superadmin escolhe o plano de um tenant.
 *   2. `admin.approvePreRegistration` — o cliente escolheu o plano sozinho no
 *      cadastro (funil self-service, ADR 0061) e a aprovação abre o teste.
 *
 * Se cada caminho montasse a própria assinatura, o projeto ganharia a oitava
 * ocorrência do padrão que ele já pagou sete vezes: duas implementações da mesma
 * regra, endurecidas em tempos diferentes. Um trial que começa com 7 dias por um
 * caminho e 0 pelo outro só aparece quando o cliente é bloqueado no dia seguinte
 * ao cadastro.
 */
import type { Prisma, BillingCycle, SubscriptionStatus } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { nextPeriodEnd, snapshotAmountCents } from "@/lib/billing/subscription";
import { getPlatformSettings, trialEndsAt } from "./platform-settings.service";

function decimalToCents(value: Prisma.Decimal | null | undefined): number {
  if (value == null) return 0;
  return Math.round(Number(value) * 100);
}

export type StartSubscriptionInput = {
  tenantId: string;
  planId: string;
  billingCycle: BillingCycle;
  /** Ausente: usa o snapshot do preço do plano no ciclo. */
  amountCents?: number;
  /** Abre em teste grátis em vez de já cobrada. */
  asTrial: boolean;
  /** Ausente com `asTrial`: usa o padrão global da plataforma. */
  trialDays?: number;
};

export type StartSubscriptionResult = {
  subscriptionId: string;
  status: SubscriptionStatus;
  currentPeriodEnd: Date;
  amountCents: number;
  /** Dias de teste efetivamente aplicados (0 quando não é teste). */
  trialDays: number;
};

/**
 * Abre (ou reabre) a assinatura do tenant e sincroniza o plano no `Tenant`.
 *
 * NÃO faz audit log: o chamador conhece o ator e a ação ("superadmin ativou" vs
 * "aprovação do cadastro abriu o teste") e registra com o vocabulário certo.
 */
export async function startSubscription(
  tx: Prisma.TransactionClient,
  input: StartSubscriptionInput,
  now: Date = new Date(),
): Promise<StartSubscriptionResult> {
  const plan = await tx.plan.findUnique({
    where: { id: input.planId },
    select: { id: true, status: true, monthlyPrice: true, yearlyPrice: true },
  });
  if (!plan) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Plano selecionado nao existe" });
  }
  if (plan.status !== "ACTIVE") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Plano selecionado esta inativo" });
  }

  const amountCents =
    input.amountCents ??
    snapshotAmountCents({
      cycle: input.billingCycle,
      monthlyCents: decimalToCents(plan.monthlyPrice),
      yearlyCents: plan.yearlyPrice == null ? null : decimalToCents(plan.yearlyPrice),
    });

  // Teste grátis (ADR 0061): concede os módulos do plano sem cobrar. O fim do
  // teste ocupa o mesmo `currentPeriodEnd` do vencimento, então acabar o teste
  // percorre o caminho já existente (PAST_DUE → carência → bloqueio).
  const status: SubscriptionStatus = input.asTrial ? "TRIALING" : "ACTIVE";
  const trialDays = input.asTrial
    ? (input.trialDays ?? (await getPlatformSettings(tx)).trialDays)
    : 0;
  const currentPeriodEnd = input.asTrial
    ? trialEndsAt(now, trialDays)
    : nextPeriodEnd({ cycle: input.billingCycle, currentPeriodEnd: null, now });

  const subscription = await tx.subscription.upsert({
    where: { tenantId: input.tenantId },
    create: {
      tenantId: input.tenantId,
      planId: input.planId,
      status,
      billingCycle: input.billingCycle,
      amountCents,
      currentPeriodEnd,
    },
    update: {
      planId: input.planId,
      status,
      billingCycle: input.billingCycle,
      amountCents,
      cancelReason: null,
      // Trocar de plano NÃO mexe no vencimento de quem já paga — o período
      // comprado é dele. Só o início de um teste redefine a data.
      ...(input.asTrial ? { currentPeriodEnd } : {}),
    },
    select: { id: true },
  });

  // Fonte canônica do plano = a Subscription (acima). `Tenant.plan` é sombra
  // mantida sincronizada durante a transição (fallback do gating). Reativa o
  // acesso (status ACTIVE).
  await tx.tenant.update({
    where: { id: input.tenantId },
    data: { plan: input.planId, status: "ACTIVE" },
  });

  return { subscriptionId: subscription.id, status, currentPeriodEnd, amountCents, trialDays };
}
