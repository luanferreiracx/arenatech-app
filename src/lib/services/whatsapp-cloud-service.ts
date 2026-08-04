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

/**
 * Credencial do TENANT, quando ele trouxe a própria conta da Meta (BYO).
 *
 * Consultada antes do ambiente: um tenant com credencial própria envia pela
 * WABA dele, não pela nossa. Devolve `null` quando não há integração
 * habilitada — e aí o envio cai no fallback de ambiente, que é o
 * comportamento de hoje.
 *
 * Import dinâmico de propósito: este módulo é usado em caminhos que não têm
 * banco (mock de dev, testes de formatação de telefone), e um import estático
 * de Prisma arrastaria a conexão para todos eles.
 */
async function getTenantConfig(tenantId: string) {
  try {
    const [{ withAdmin }, { readCloudCredential }] = await Promise.all([
      import("@/server/db"),
      import("@/lib/services/whatsapp-tenant-config"),
    ]);
    const row = await withAdmin((tx) =>
      tx.tenantIntegration.findUnique({
        where: { tenantId_provider: { tenantId, provider: "WHATSAPP_CLOUD" } },
        select: { enabled: true, config: true },
      }),
    );
    if (!row?.enabled) return null;

    const credential = readCloudCredential(row.config);
    if (!credential) return null;

    const apiVersion = process.env.WHATSAPP_CLOUD_API_VERSION ?? "v22.0";
    return {
      token: credential.token,
      phoneNumberId: credential.phoneNumberId,
      apiUrl: `https://graph.facebook.com/${apiVersion}/${credential.phoneNumberId}/messages`,
    };
  } catch (error) {
    // Falha ao LER a credencial não pode derrubar o envio: cai no ambiente,
    // que é o comportamento anterior. Silenciar seria pior — daí o log.
    logger.error("WhatsApp Cloud: falha ao ler credencial do tenant", {
      tenantId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Resolve a credencial a usar: a do TENANT quando existe, senão a do ambiente.
 *
 * Fallback e não substituição, de propósito: o sistema roda hoje com a conta
 * única do ambiente, e trocar isso de uma vez desligaria o WhatsApp de todo
 * mundo que ainda não configurou o seu.
 */
async function resolveConfig(tenantId?: string) {
  if (tenantId) {
    const tenantConfig = await getTenantConfig(tenantId);
    if (tenantConfig) return tenantConfig;
  }
  return getConfig();
}

function getConfig() {
  // Aceita tanto WHATSAPP_CLOUD_* (novo) quanto META_WHATSAPP_* (legado Laravel).
  // Facilita migracao do VPS sem mexer no .env existente.
  const token = process.env.WHATSAPP_CLOUD_TOKEN ?? process.env.META_WHATSAPP_TOKEN;
  const phoneNumberId =
    process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID ?? process.env.META_WHATSAPP_PHONE_NUMBER_ID;
  const apiVersion = process.env.WHATSAPP_CLOUD_API_VERSION ?? "v22.0";
  if (!token || !phoneNumberId) {
    // WHATSAPP_MOCK=1 forca o modo mock mesmo com NODE_ENV=production. Necessario
    // p/ E2E no CI (a imagem roda como production, mas nao ha credenciais Meta —
    // queremos mockar a integracao externa, nao quebrar o fluxo). NUNCA setar em
    // prod real (mensagens seriam descartadas silenciosamente).
    if (process.env.WHATSAPP_MOCK === "1") {
      return null;
    }
    if (process.env.NODE_ENV === "production") {
      // Em prod, mock-mode silencioso e perigoso: mensagens "enviadas" sao
      // descartadas sem qualquer indicacao no UI. Falha cedo e ruidoso.
      throw new Error(
        "WhatsApp Cloud: WHATSAPP_CLOUD_TOKEN/PHONE_NUMBER_ID ausentes em prod. Configure as envs ou remova o uso de WA Cloud.",
      );
    }
    return null;
  }
  return {
    token,
    phoneNumberId,
    apiUrl: `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`,
  };
}

/** Timeout para chamadas a Graph API da Meta (Cloud API). */
const META_FETCH_TIMEOUT_MS = 15_000;

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
  /** Quando presente, usa a credencial DESTE tenant (BYO) em vez da do ambiente. */
  tenantId?: string,
): Promise<WhatsAppCloudResult> {
  const cfg = await resolveConfig(tenantId);
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
      signal: AbortSignal.timeout(META_FETCH_TIMEOUT_MS),
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
  /** Quando presente, usa a credencial DESTE tenant (BYO) em vez da do ambiente. */
  tenantId?: string,
): Promise<WhatsAppCloudResult> {
  const cfg = await resolveConfig(tenantId);
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
      signal: AbortSignal.timeout(META_FETCH_TIMEOUT_MS),
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
    const messageId = json.messages?.[0]?.id;
    logger.info("WhatsApp Cloud template sent", { to: normalized, templateName, messageId });
    return { success: true, messageId, rawResponse: json };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.error("WhatsApp Cloud template exception", { to: normalized, templateName, error });
    return { success: false, error };
  }
}
