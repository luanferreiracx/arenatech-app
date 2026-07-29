/**
 * Email service integration.
 *
 * In production (RESEND_API_KEY configured): sends via Resend API.
 * In development: logs the email. Mailhog is available at localhost:1025
 * but Resend is the primary integration.
 *
 * @see https://resend.com/docs
 */

import { logger } from "@/lib/logger";
import { BRAND_NAME } from "@/lib/brand";
import { htmlToPlainText } from "@/lib/utils/html";

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export interface EmailSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  /**
   * Remetente. Default: EMAIL_FROM global. Fluxos com marca própria (ex.:
   * NO-KYC) passam o seu — sem alterar o remetente dos demais e-mails. Ver ADR
   * 0050. O domínio precisa estar verificado no Resend.
   */
  from?: string;
  /**
   * Alternativa em texto puro. Omitida → derivada do HTML. Nunca enviamos
   * só-HTML: filtros (Outlook em especial) tratam isso como sinal de spam.
   */
  text?: string;
  replyTo?: string;
};

/**
 * A Resend recusa remetente de domínio não verificado com 403. É erro de
 * CONFIGURAÇÃO (falta verificar o domínio), não falha transitória — merece
 * mensagem própria pra não se perder no meio de "HTTP 4xx".
 */
const HTTP_FORBIDDEN = 403;

/**
 * Remetente padrão. `pdvdepix.app` é o domínio verificado no Resend — o antigo
 * default (`@arenatechpi.com.br`) nunca foi verificado, então TODO e-mail que
 * caía no default (reset de senha, NF-e por e-mail, contato com cliente) era
 * recusado com 403.
 */
const DEFAULT_EMAIL_FROM = "noreply@pdvdepix.app";

const SENDER_NAME = BRAND_NAME;

/**
 * Garante nome visível no remetente: `noreply@dominio` pelado pontua pior nos
 * filtros e o destinatário não reconhece quem mandou. Fica no código, e não na
 * env, de propósito — `EMAIL_FROM="Nome <a@b>"` depende de quem lê o arquivo
 * remover as aspas (docker compose, systemd, shell divergem) e um dia manda o
 * remetente com aspas literais. A env guarda só o endereço.
 */
function withSenderName(address: string): string {
  return address.includes("<") ? address : `${SENDER_NAME} <${address}>`;
}

// ────────────────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────────────────

export async function sendEmail(input: SendEmailInput): Promise<EmailSendResult> {
  const { to, subject, html, from, replyTo } = input;
  const apiKey = process.env.RESEND_API_KEY;
  // `||` de propósito: `EMAIL_FROM=` em branco no compose tem que cair no
  // default, não virar remetente vazio.
  const fromAddress = withSenderName(
    from?.trim() || process.env.EMAIL_FROM?.trim() || DEFAULT_EMAIL_FROM,
  );
  const text = input.text ?? htmlToPlainText(html);

  if (!apiKey) {
    // Em prod, mock-mode silencioso e perigoso (ex: reset de senha
    // "enviado" mas nunca chega). Falha cedo e ruidoso.
    if (process.env.NODE_ENV === "production") {
      logger.error("Email: RESEND_API_KEY ausente em prod — recusando envio.", { to, subject });
      return { success: false, error: "Servico de e-mail nao configurado" };
    }
    logger.info("Email: mock mode (no RESEND_API_KEY)", { to, subject });
    return { success: true, messageId: `mock-email-${Date.now()}` };
  }

  logger.info("Email: sending via Resend", { to, subject });

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [to],
        subject,
        html,
        text,
        ...(replyTo ? { reply_to: [replyTo] } : {}),
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      const body = await response.text();
      if (response.status === HTTP_FORBIDDEN && body.includes("not verified")) {
        const error = `Remetente "${fromAddress}" recusado: dominio nao verificado no Resend.`;
        logger.error("Email: remetente com dominio nao verificado no Resend", {
          from: fromAddress,
          to,
          subject,
        });
        return { success: false, error };
      }
      logger.error("Email: Resend API error", { status: response.status, from: fromAddress, to, subject });
      return {
        success: false,
        error: `Resend API HTTP ${response.status}: ${body.substring(0, 200)}`,
      };
    }

    const data = (await response.json()) as Record<string, unknown>;
    const messageId = String(data["id"] ?? "");
    logger.info("Email: sent successfully", { to, subject, messageId });
    return {
      success: true,
      messageId,
    };
  } catch (error) {
    logger.error("Email: send error", {
      to,
      subject,
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao enviar e-mail",
    };
  }
}
