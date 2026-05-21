/**
 * WhatsApp Business Cloud API (Meta Graph API) integration.
 *
 * Substitui gradualmente whatsapp-service.ts (Evolution) pela API oficial.
 *
 * Quando WHATSAPP_CLOUD_TOKEN e WHATSAPP_CLOUD_PHONE_NUMBER_ID estao
 * configurados, faz chamada real para Graph API; caso contrario retorna
 * mock success (logger.info) para desenvolvimento.
 *
 * Env vars esperadas:
 *   WHATSAPP_CLOUD_TOKEN              — Token permanente do system user
 *   WHATSAPP_CLOUD_PHONE_NUMBER_ID    — ID do numero de WA Business
 *   WHATSAPP_CLOUD_API_VERSION        — opcional, default "v22.0"
 *
 * @see https://developers.facebook.com/docs/whatsapp/cloud-api
 */

import { logger } from "@/lib/logger";

export interface WhatsAppCloudResult {
  success: boolean;
  messageId?: string;
  error?: string;
  rawResponse?: unknown;
}

function getConfig() {
  // Aceita tanto WHATSAPP_CLOUD_* (novo) quanto META_WHATSAPP_* (legado Laravel).
  // Facilita migracao do VPS sem mexer no .env existente.
  const token = process.env.WHATSAPP_CLOUD_TOKEN ?? process.env.META_WHATSAPP_TOKEN;
  const phoneNumberId =
    process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID ?? process.env.META_WHATSAPP_PHONE_NUMBER_ID;
  const apiVersion = process.env.WHATSAPP_CLOUD_API_VERSION ?? "v22.0";
  if (!token || !phoneNumberId) return null;
  return {
    token,
    phoneNumberId,
    apiUrl: `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`,
  };
}

/**
 * Normaliza um numero brasileiro para o formato esperado pela Cloud API:
 *   55 + DDD + numero (sem 9 extra duplicado)
 * Exemplo: "(11) 99999-8888" → "5511999998888"
 */
export function formatBrPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

/**
 * Envia texto simples (template-free, dentro da janela de 24h).
 * Para mensagens fora da janela, use sendTemplate.
 */
export async function sendCloudText(
  to: string,
  body: string,
): Promise<WhatsAppCloudResult> {
  const cfg = getConfig();
  const normalized = formatBrPhone(to);

  if (!cfg) {
    logger.info("WhatsApp Cloud mock send", { to: normalized, preview: body.slice(0, 80) });
    return { success: true, messageId: `mock-${Date.now()}` };
  }

  try {
    const res = await fetch(cfg.apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: normalized,
        type: "text",
        text: { body },
      }),
    });
    const json = (await res.json()) as {
      messages?: Array<{ id: string }>;
      error?: { message: string; code: number };
    };
    if (!res.ok || json.error) {
      const error = json.error?.message ?? `HTTP ${res.status}`;
      logger.error("WhatsApp Cloud send failed", { to: normalized, error });
      return { success: false, error, rawResponse: json };
    }
    const messageId = json.messages?.[0]?.id;
    logger.info("WhatsApp Cloud send ok", { to: normalized, messageId });
    return { success: true, messageId, rawResponse: json };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.error("WhatsApp Cloud send exception", { to: normalized, error });
    return { success: false, error };
  }
}

/**
 * Envia template aprovado (necessario fora da janela de 24h).
 * `components` segue spec Cloud API — header/body/buttons.
 */
export async function sendCloudTemplate(
  to: string,
  templateName: string,
  languageCode: string = "pt_BR",
  components?: unknown[],
): Promise<WhatsAppCloudResult> {
  const cfg = getConfig();
  const normalized = formatBrPhone(to);

  if (!cfg) {
    logger.info("WhatsApp Cloud mock template", { to: normalized, templateName });
    return { success: true, messageId: `mock-${Date.now()}` };
  }

  try {
    const res = await fetch(cfg.apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: normalized,
        type: "template",
        template: {
          name: templateName,
          language: { code: languageCode },
          components: components ?? [],
        },
      }),
    });
    const json = (await res.json()) as {
      messages?: Array<{ id: string }>;
      error?: { message: string; code: number };
    };
    if (!res.ok || json.error) {
      const error = json.error?.message ?? `HTTP ${res.status}`;
      logger.error("WhatsApp Cloud template failed", { to: normalized, templateName, error });
      return { success: false, error, rawResponse: json };
    }
    return { success: true, messageId: json.messages?.[0]?.id, rawResponse: json };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { success: false, error };
  }
}
