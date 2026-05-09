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

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export interface EmailSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────────────────

export async function sendEmail(
  to: string,
  subject: string,
  html: string,
): Promise<EmailSendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "noreply@arenatechpi.com.br";

  if (!apiKey) {
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
        from,
        to: [to],
        subject,
        html,
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      const body = await response.text();
      logger.error("Email: Resend API error", { status: response.status, to, subject });
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
