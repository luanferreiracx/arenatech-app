/**
 * Avisos do onboarding (ADR 0061/0064) — os dois lados da fila de aprovação.
 *
 * O defeito que isto fecha: o funil terminava em silêncio nas duas pontas.
 *
 * - **Do lado de quem vende:** o cadastro entrava na fila e NADA avisava. O
 *   superadmin só descobria abrindo `/admin/pre-registrations` por conta
 *   própria. Num funil self-service, cada hora parada na fila é um cliente que
 *   pagou com atenção e está esperando — e o tempo de espera não é medido por
 *   ninguém.
 * - **Do lado de quem compra:** a aprovação mostrava um toast na tela do
 *   superadmin e acabava. A pessoa aprovada não recebia nada; a tela
 *   `/register/pending` prometia uma mensagem no WhatsApp que ninguém mandava.
 *
 * Desenho: **nunca lança**. Um aviso é efeito colateral do cadastro/aprovação,
 * não parte deles. Derrubar uma aprovação porque a Resend está fora seria trocar
 * um problema pequeno (ninguém avisado) por um grande (tenant não criado, com o
 * pré-cadastro já consumido). Falha vira log, sempre com o retorno do envio —
 * "disparado" não é "entregue", e um 403 de domínio passa silencioso se ninguém
 * olhar.
 *
 * Envio SEMPRE fora da transação de banco: I/O de rede dentro de transação
 * prende conexão e transforma timeout do provedor em rollback de tudo. É a mesma
 * razão pela qual o dunning separa reserva de entrega.
 */
import { logger } from "@/lib/logger";
import { prisma } from "@/server/db";
import { sendEmail } from "@/lib/services/email-service";
import { sendTextWithFallback } from "@/lib/whatsapp/send-with-fallback";
import { escapeHtml } from "@/lib/utils/html";

/** Remetente: só `pdvdepix.app` é verificado na Resend (arenatechpi devolve 403). */
const ONBOARDING_EMAIL_FROM = "Arena Tech <contato@pdvdepix.app>";

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "https://pdvdepix.app";
}

function layout(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html><html lang="pt-BR"><body style="font-family:system-ui,-apple-system,sans-serif;line-height:1.6;color:#111">
<h2 style="margin:0 0 12px">${escapeHtml(title)}</h2>
${bodyHtml}
<p style="margin-top:24px;font-size:12px;color:#666">Arena Tech</p>
</body></html>`;
}

/**
 * Avisa os superadmins de que um cadastro entrou na fila.
 *
 * Destinatário vem do BANCO (`isSuperAdmin`), não de env var: quem administra a
 * plataforma já está modelado, e uma variável de ambiente a mais seria uma
 * segunda verdade sobre "quem é o dono" — que sai de sincronia no dia em que
 * alguém entra ou sai.
 */
export async function notifyNewPreRegistration(input: {
  preRegistrationId: string;
  tradeName: string;
  ownerName: string;
  ownerEmail: string;
  planName: string | null;
}): Promise<void> {
  try {
    // `User` não tem soft-delete nem flag de ativo — quem deixa de ser
    // superadmin tem o `isSuperAdmin` desligado. O filtro é esse mesmo.
    const admins = await prisma.user.findMany({
      where: { isSuperAdmin: true, email: { not: null } },
      select: { email: true },
    });
    if (admins.length === 0) {
      logger.warn("Onboarding: nenhum superadmin com e-mail para avisar", {
        preRegistrationId: input.preRegistrationId,
      });
      return;
    }

    const link = `${appUrl()}/admin/pre-registrations/${input.preRegistrationId}`;
    const plano = input.planName
      ? `<p>Plano escolhido: <strong>${escapeHtml(input.planName)}</strong></p>`
      : `<p>A pessoa se cadastrou <strong>sem escolher plano</strong> — defina um na aprovação.</p>`;

    const html = layout("Novo cadastro aguardando aprovação", [
      `<p><strong>${escapeHtml(input.tradeName)}</strong> — ${escapeHtml(input.ownerName)} (${escapeHtml(input.ownerEmail)})</p>`,
      plano,
      `<p>E-mail e WhatsApp já verificados.</p>`,
      `<p><a href="${link}" style="display:inline-block;padding:10px 16px;background:#111;color:#fff;text-decoration:none;border-radius:6px">Revisar cadastro</a></p>`,
    ].join(""));

    for (const admin of admins) {
      const result = await sendEmail({
        to: admin.email!,
        subject: `Novo cadastro: ${input.tradeName}`,
        html,
        from: ONBOARDING_EMAIL_FROM,
      });
      if (!result.success) {
        logger.error("Onboarding: aviso de novo cadastro não saiu", {
          preRegistrationId: input.preRegistrationId,
          error: result.error,
        });
      }
    }
  } catch (error) {
    // Nunca derruba o cadastro: a pessoa já verificou e-mail e telefone, e o
    // pré-cadastro está gravado. Perder o aviso é recuperável (a fila continua
    // na tela); perder o cadastro não é.
    logger.error("Onboarding: falha ao avisar superadmins", {
      preRegistrationId: input.preRegistrationId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Avisa quem se cadastrou de que a conta foi aprovada e o teste começou.
 *
 * É a mensagem que a tela `/register/pending` promete ("você recebe uma mensagem
 * no WhatsApp assim que for aprovado") e que nunca era enviada.
 */
export async function notifyPreRegistrationApproved(input: {
  tenantId: string;
  tenantName: string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string | null;
  /** Senha temporária no fluxo KYC; nulo no NO-KYC (a pessoa definiu a própria). */
  tempPassword: string | null;
  trialEndsAt: Date | null;
}): Promise<void> {
  const primeiroNome = input.ownerName.split(" ")[0] ?? input.ownerName;
  const loginUrl = `${appUrl()}/login`;

  const trialLinha = input.trialEndsAt
    ? `<p>Seu teste grátis vai até <strong>${input.trialEndsAt.toLocaleDateString("pt-BR")}</strong>. Até lá, tudo liberado, sem cobrança.</p>`
    : "";

  // Senha temporária só existe no fluxo KYC. No NO-KYC a pessoa entra com a
  // senha que ela mesma criou — dizer "sua senha é X" ali seria mentira.
  const acesso = input.tempPassword
    ? `<p>Entre com o seu CPF e a senha temporária <strong>${escapeHtml(input.tempPassword)}</strong>. O sistema pede a troca no primeiro acesso.</p>`
    : `<p>Entre com <strong>${escapeHtml(input.ownerEmail)}</strong> e a senha que você criou no cadastro.</p>`;

  try {
    const html = layout(`Sua conta foi aprovada, ${primeiroNome}!`, [
      `<p>A loja <strong>${escapeHtml(input.tenantName)}</strong> já está no ar.</p>`,
      trialLinha,
      acesso,
      `<p><a href="${loginUrl}" style="display:inline-block;padding:10px 16px;background:#111;color:#fff;text-decoration:none;border-radius:6px">Entrar agora</a></p>`,
    ].join(""));

    const result = await sendEmail({
      to: input.ownerEmail,
      subject: "Sua conta na Arena Tech foi aprovada",
      html,
      from: ONBOARDING_EMAIL_FROM,
    });
    if (!result.success) {
      logger.error("Onboarding: e-mail de aprovação não saiu", {
        tenantId: input.tenantId,
        error: result.error,
      });
    }
  } catch (error) {
    logger.error("Onboarding: falha no e-mail de aprovação", {
      tenantId: input.tenantId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  if (!input.ownerPhone) return;
  try {
    // A senha temporária NUNCA vai por WhatsApp: a mensagem fica no aparelho, é
    // encaminhável e passa por servidor de terceiro. O e-mail acima leva o
    // acesso; aqui é só o empurrão para a pessoa abrir o sistema.
    const result = await sendTextWithFallback({
      phone: input.ownerPhone,
      freeText: `Oi, ${primeiroNome}! Sua conta na Arena Tech foi aprovada e a loja ${input.tenantName} já está no ar. Enviamos os detalhes de acesso para o seu e-mail.`,
      contexto: "onboarding_aprovado",
      params: [primeiroNome, "a aprovação da sua conta na Arena Tech"],
    });
    if (!result.success) {
      logger.warn("Onboarding: WhatsApp de aprovação não saiu", {
        tenantId: input.tenantId,
        error: result.error,
      });
    }
  } catch (error) {
    logger.warn("Onboarding: falha no WhatsApp de aprovação", {
      tenantId: input.tenantId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
