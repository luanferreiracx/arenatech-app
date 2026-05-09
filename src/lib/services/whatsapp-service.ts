/**
 * WhatsApp integration via Evolution API.
 *
 * When EVOLUTION_API_URL and EVOLUTION_API_KEY are configured, makes real
 * API requests. Otherwise logs and returns success for development.
 *
 * @see https://doc.evolution-api.com/
 */

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export interface WhatsAppSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

interface EvolutionConfig {
  url: string;
  apiKey: string;
  instanceName: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Config
// ────────────────────────────────────────────────────────────────────────────

function getConfig(): EvolutionConfig | null {
  const url = process.env.EVOLUTION_API_URL;
  const apiKey = process.env.EVOLUTION_API_KEY;
  const instanceName = process.env.EVOLUTION_INSTANCE_NAME ?? "arena-intranet";

  if (!url || !apiKey) {
    return null;
  }

  return { url: url.replace(/\/$/, ""), apiKey, instanceName };
}

// ────────────────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────────────────

/**
 * Format a Brazilian phone number to the WhatsApp format (5511999999999).
 * Handles +55, (XX), dashes, and spaces.
 */
export function formatPhone(phone: string): string {
  // Strip all non-digits
  const digits = phone.replace(/\D/g, "");

  // If already starts with 55 and has 12-13 digits, use as-is
  if (digits.startsWith("55") && digits.length >= 12 && digits.length <= 13) {
    return digits;
  }

  // If 10-11 digits (DDD + number), prepend 55
  if (digits.length >= 10 && digits.length <= 11) {
    return `55${digits}`;
  }

  // Fallback: return cleaned digits
  return digits;
}

/**
 * Send a text message via WhatsApp.
 */
export async function sendTextMessage(
  phone: string,
  text: string,
): Promise<WhatsAppSendResult> {
  const config = getConfig();
  const formattedPhone = formatPhone(phone);

  if (!config) {
    console.log(`[WhatsApp Mock] Sending text to ${formattedPhone}: ${text.substring(0, 100)}...`);
    return { success: true, messageId: `mock-wa-${Date.now()}` };
  }

  try {
    const response = await fetch(
      `${config.url}/message/sendText/${config.instanceName}`,
      {
        method: "POST",
        headers: {
          apikey: config.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          number: formattedPhone,
          text,
        }),
        signal: AbortSignal.timeout(15_000),
      },
    );

    if (!response.ok) {
      const body = await response.text();
      return {
        success: false,
        error: `Evolution API HTTP ${response.status}: ${body.substring(0, 200)}`,
      };
    }

    const data = (await response.json()) as Record<string, unknown>;
    const key = data["key"] as Record<string, unknown> | undefined;
    const messageId = key ? String(key["id"] ?? "") : undefined;

    return { success: true, messageId };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao enviar WhatsApp",
    };
  }
}

/**
 * Send a media message (PDF, image) via WhatsApp.
 */
export async function sendMediaMessage(
  phone: string,
  mediaUrl: string,
  caption?: string,
): Promise<WhatsAppSendResult> {
  const config = getConfig();
  const formattedPhone = formatPhone(phone);

  if (!config) {
    console.log(
      `[WhatsApp Mock] Sending media to ${formattedPhone}: ${mediaUrl} (caption: ${caption ?? "none"})`,
    );
    return { success: true, messageId: `mock-wa-media-${Date.now()}` };
  }

  try {
    const response = await fetch(
      `${config.url}/message/sendMedia/${config.instanceName}`,
      {
        method: "POST",
        headers: {
          apikey: config.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          number: formattedPhone,
          mediatype: "document",
          media: mediaUrl,
          caption: caption ?? "",
        }),
        signal: AbortSignal.timeout(30_000),
      },
    );

    if (!response.ok) {
      const body = await response.text();
      return {
        success: false,
        error: `Evolution API HTTP ${response.status}: ${body.substring(0, 200)}`,
      };
    }

    const data = (await response.json()) as Record<string, unknown>;
    const key = data["key"] as Record<string, unknown> | undefined;
    const messageId = key ? String(key["id"] ?? "") : undefined;

    return { success: true, messageId };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao enviar mídia WhatsApp",
    };
  }
}

/**
 * Send a template message with variable substitution.
 * Replaces {{key}} placeholders in the template body.
 */
export async function sendTemplateMessage(
  phone: string,
  templateBody: string,
  params: Record<string, string>,
): Promise<WhatsAppSendResult> {
  let text = templateBody;
  for (const [key, value] of Object.entries(params)) {
    text = text.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
  }
  return sendTextMessage(phone, text);
}
