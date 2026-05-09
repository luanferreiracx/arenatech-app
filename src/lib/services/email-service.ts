/**
 * Email service integration.
 *
 * In production (RESEND_API_KEY configured): sends via Resend API.
 * In development: logs the email. Mailhog is available at localhost:1025
 * but Resend is the primary integration.
 *
 * @see https://resend.com/docs
 */

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
    console.log(`[Email Mock] To: ${to} | Subject: ${subject} | Body: ${html.substring(0, 100)}...`);
    return { success: true, messageId: `mock-email-${Date.now()}` };
  }

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
      return {
        success: false,
        error: `Resend API HTTP ${response.status}: ${body.substring(0, 200)}`,
      };
    }

    const data = (await response.json()) as Record<string, unknown>;
    return {
      success: true,
      messageId: String(data["id"] ?? ""),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao enviar e-mail",
    };
  }
}
