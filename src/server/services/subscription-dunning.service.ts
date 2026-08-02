/**
 * Avisos de cobrança da assinatura (ADR 0061).
 *
 * O defeito que isto fecha: NADA avisava o cliente. Nem "vence em 3 dias", nem
 * "venceu", nem "vamos suspender amanhã", nem "suspendemos". Ele descobria a
 * suspensão quando tentava trabalhar. `runSubscriptionExpiry` até devolvia
 * `suspendedTenantIds`, e o cron jogava a lista fora.
 *
 * Desenho em duas etapas, de propósito:
 *
 * 1. `claimDunningNotices` roda numa transação e RESERVA os avisos devidos
 *    (INSERT com chave única). Nada é enviado aqui.
 * 2. `deliverDunningNotices` envia FORA da transação e carimba o que saiu.
 *
 * Enviar e-mail dentro de uma transação de banco prende conexão em I/O de rede e
 * transforma um timeout do provedor em rollback de tudo. E a reserva antes do
 * envio é o que impede o reenvio diário: se o envio falhar, a linha fica com
 * `sentAt` nulo e o cron do dia seguinte tenta de novo — sem duplicar o que já
 * saiu.
 */
import type { Prisma } from "@prisma/client";
import { logger } from "@/lib/logger";
import { sendEmail } from "@/lib/services/email-service";
import { sendTextWithFallback } from "@/lib/whatsapp/send-with-fallback";
import { escapeHtml } from "@/lib/utils/html";
import { formatCentsBRL } from "@/lib/format";
import { dueNotices, type SubscriptionNoticeKind } from "@/lib/billing/dunning";

/** Remetente: só `pdvdepix.app` é verificado na Resend (arenatechpi devolve 403). */
const BILLING_EMAIL_FROM = "Arena Tech <cobranca@pdvdepix.app>";

export type DunningTarget = {
  notificationId: string;
  subscriptionId: string;
  tenantId: string;
  tenantName: string;
  kind: SubscriptionNoticeKind;
  amountCents: number;
  currentPeriodEnd: Date;
  needsEmail: boolean;
  needsWhatsapp: boolean;
  recipients: Array<{ name: string; email: string | null; phone: string | null }>;
};

export type DunningResult = {
  claimed: number;
  emailsSent: number;
  whatsappSent: number;
  failures: number;
};

/**
 * Reserva os avisos devidos hoje. Devolve só o que ainda precisa sair — inclusive
 * reservas antigas cujo envio falhou (`sentAt` nulo).
 */
export async function claimDunningNotices(
  tx: Prisma.TransactionClient,
  args: { now: Date; graceDays: number },
): Promise<DunningTarget[]> {
  const subscriptions = await tx.subscription.findMany({
    // `CANCELLED` fica de fora: não se persegue quem já saiu. `TRIALING` entra —
    // avisar que o teste acaba é o momento de conversão do funil.
    where: { status: { in: ["TRIALING", "ACTIVE", "PAST_DUE", "SUSPENDED"] } },
    select: {
      id: true,
      tenantId: true,
      status: true,
      amountCents: true,
      currentPeriodEnd: true,
    },
  });
  if (subscriptions.length === 0) return [];

  const tenants = await tx.tenant.findMany({
    where: { id: { in: subscriptions.map((s) => s.tenantId) } },
    select: {
      id: true,
      name: true,
      users: {
        where: { role: "admin" },
        select: { user: { select: { name: true, email: true, phone: true } } },
      },
    },
  });
  const tenantById = new Map(tenants.map((t) => [t.id, t]));

  const targets: DunningTarget[] = [];

  for (const sub of subscriptions) {
    const kinds = dueNotices({
      status: sub.status,
      currentPeriodEnd: sub.currentPeriodEnd,
      now: args.now,
      graceDays: args.graceDays,
    });
    if (kinds.length === 0) continue;

    const tenant = tenantById.get(sub.tenantId);
    // Tenant sem admin cadastrado não tem para quem avisar. Registrar a reserva
    // assim mesmo esconderia o problema; logar deixa rastro.
    const recipients = (tenant?.users ?? [])
      .map((ut) => ut.user)
      .filter((u) => u.email || u.phone);
    if (recipients.length === 0) {
      logger.warn("Dunning: tenant sem admin com e-mail ou telefone", {
        tenantId: sub.tenantId,
        subscriptionId: sub.id,
      });
      continue;
    }

    for (const kind of kinds) {
      // upsert = reserva idempotente. `create` vazio no update: se a linha já
      // existe, ela manda (inclusive os carimbos de envio).
      const notification = await tx.subscriptionNotification.upsert({
        where: {
          subscriptionId_kind_periodEnd: {
            subscriptionId: sub.id,
            kind,
            periodEnd: sub.currentPeriodEnd,
          },
        },
        create: {
          subscriptionId: sub.id,
          tenantId: sub.tenantId,
          kind,
          periodEnd: sub.currentPeriodEnd,
        },
        update: {},
        select: { id: true, emailSentAt: true, whatsappSentAt: true },
      });

      const needsEmail =
        notification.emailSentAt === null && recipients.some((r) => Boolean(r.email));
      const needsWhatsapp =
        notification.whatsappSentAt === null && recipients.some((r) => Boolean(r.phone));
      if (!needsEmail && !needsWhatsapp) continue;

      targets.push({
        notificationId: notification.id,
        subscriptionId: sub.id,
        tenantId: sub.tenantId,
        tenantName: tenant?.name ?? "sua loja",
        kind,
        amountCents: sub.amountCents,
        currentPeriodEnd: sub.currentPeriodEnd,
        needsEmail,
        needsWhatsapp,
        recipients,
      });
    }
  }

  return targets;
}

function formatDate(value: Date): string {
  return value.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

type NoticeCopy = { subject: string; headline: string; body: string; whatsappSubject: string };

/** Texto de cada aviso. Um lugar só — o e-mail e o WhatsApp não podem divergir. */
export function noticeCopy(target: {
  kind: SubscriptionNoticeKind;
  tenantName: string;
  amountCents: number;
  currentPeriodEnd: Date;
  graceDays: number;
}): NoticeCopy {
  const valor = formatCentsBRL(target.amountCents);
  const vencimento = formatDate(target.currentPeriodEnd);

  const copies: Record<SubscriptionNoticeKind, NoticeCopy> = {
    TRIAL_ENDING: {
      subject: `Seu teste grátis termina em ${vencimento}`,
      headline: "Seu teste grátis está acabando",
      body:
        `O período de teste de ${target.tenantName} termina em ${vencimento}. ` +
        `Para continuar com tudo funcionando, ative o plano por ${valor} em ` +
        "Configurações › Assinatura. Seus dados ficam como estão de qualquer forma.",
      whatsappSubject: `o fim do seu teste grátis em ${vencimento}`,
    },
    DUE_SOON: {
      subject: `Sua assinatura Arena Tech vence em ${vencimento}`,
      headline: "Sua assinatura vence em breve",
      body:
        `A mensalidade de ${target.tenantName} (${valor}) vence em ${vencimento}. ` +
        "Você pode pagar por PIX direto no sistema, em Configurações › Assinatura.",
      whatsappSubject: `o vencimento da sua assinatura em ${vencimento}`,
    },
    PAST_DUE: {
      subject: "Sua assinatura Arena Tech venceu",
      headline: "Sua assinatura venceu",
      body:
        `A mensalidade de ${target.tenantName} (${valor}) venceu em ${vencimento}. ` +
        `Seu acesso continua normal por ${target.graceDays} dias. ` +
        "Pague por PIX em Configurações › Assinatura para não ter interrupção.",
      whatsappSubject: "a mensalidade que venceu",
    },
    GRACE_ENDING: {
      subject: "Último dia antes da suspensão da sua assinatura",
      headline: "Seu acesso será pausado amanhã",
      body:
        `A mensalidade de ${target.tenantName} (${valor}) segue em aberto desde ${vencimento}. ` +
        "Amanhã os módulos do plano são pausados. Sua carteira DePix e seus dados continuam intactos. " +
        "Pague por PIX em Configurações › Assinatura para evitar a pausa.",
      whatsappSubject: "a suspensão do seu acesso amanhã",
    },
    SUSPENDED: {
      subject: "Acesso pausado — regularize para voltar",
      headline: "Seu acesso aos módulos do plano está pausado",
      body:
        `A mensalidade de ${target.tenantName} (${valor}) não foi paga e o acesso aos módulos do ` +
        "plano está pausado. Nenhum dado foi perdido, e sua carteira DePix segue liberada. " +
        "Entre no sistema e pague por PIX para reativar na hora.",
      whatsappSubject: "a reativação do seu acesso",
    },
  };

  return copies[target.kind];
}

function renderEmail(copy: NoticeCopy, appUrl: string): string {
  return `
    <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 560px; margin: 0 auto;">
      <h2 style="color: #111;">${escapeHtml(copy.headline)}</h2>
      <p style="color: #444; line-height: 1.6;">${escapeHtml(copy.body)}</p>
      <p style="margin: 28px 0;">
        <a href="${appUrl}/settings/subscription"
           style="background:#0d9488;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;display:inline-block;">
          Pagar assinatura
        </a>
      </p>
      <p style="color:#888;font-size:12px;">Arena Tech · esta é uma mensagem automática de cobrança.</p>
    </div>
  `;
}

/**
 * Envia os avisos reservados e carimba o que saiu. Roda FORA de transação.
 * Falha de um destinatário não derruba os demais.
 */
export async function deliverDunningNotices(
  targets: DunningTarget[],
  deps: {
    graceDays: number;
    appUrl: string;
    stamp: (id: string, data: { emailSentAt?: Date; whatsappSentAt?: Date }) => Promise<void>;
  },
): Promise<Omit<DunningResult, "claimed">> {
  let emailsSent = 0;
  let whatsappSent = 0;
  let failures = 0;

  for (const target of targets) {
    const copy = noticeCopy({ ...target, graceDays: deps.graceDays });

    if (target.needsEmail) {
      const emails = target.recipients.map((r) => r.email).filter((e): e is string => Boolean(e));
      let anyDelivered = false;
      for (const to of emails) {
        // NUNCA descartar o retorno de sendEmail: "disparado" não é "entregue",
        // e um 403 de domínio não verificado passa silencioso se ninguém olhar.
        const result = await sendEmail({
          to,
          subject: copy.subject,
          html: renderEmail(copy, deps.appUrl),
          from: BILLING_EMAIL_FROM,
        });
        if (result.success) {
          anyDelivered = true;
          emailsSent++;
        } else {
          failures++;
          logger.error("Dunning: e-mail não saiu", {
            tenantId: target.tenantId,
            kind: target.kind,
            error: result.error,
          });
        }
      }
      if (anyDelivered) await deps.stamp(target.notificationId, { emailSentAt: new Date() });
    }

    if (target.needsWhatsapp) {
      const phones = target.recipients
        .filter((r) => r.phone)
        .map((r) => ({ phone: r.phone!, name: r.name }));
      let anyDelivered = false;
      for (const { phone, name } of phones) {
        // Fora da janela de 24h a Meta só aceita template aprovado; `padrao`
        // recebe [nome, assunto]. O detalhe completo vai no e-mail — aqui é o
        // empurrão para a pessoa abrir o sistema.
        const result = await sendTextWithFallback({
          phone,
          freeText: `${copy.headline}. ${copy.body}`,
          contexto: "cobranca_assinatura",
          params: [name.split(" ")[0] ?? name, copy.whatsappSubject],
        });
        if (result.success) {
          anyDelivered = true;
          whatsappSent++;
        } else {
          failures++;
          logger.warn("Dunning: WhatsApp não saiu", {
            tenantId: target.tenantId,
            kind: target.kind,
            error: result.error,
          });
        }
      }
      if (anyDelivered) await deps.stamp(target.notificationId, { whatsappSentAt: new Date() });
    }
  }

  return { emailsSent, whatsappSent, failures };
}
