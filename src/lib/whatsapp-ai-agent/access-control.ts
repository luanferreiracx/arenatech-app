export type WhatsappAiAgentKind = "assistant" | "claude_code";

export type WhatsappAiAccessConfig = {
  enabled: boolean;
  webhookToken: string | null;
  instanceName: string | null;
  assistantPhones: string | null;
  codePhones: string | null;
  legacyAllowedPhone: string | null;
  tenantId: string | null;
};

export type WhatsappAiAccessDecision =
  | { allowed: true; phone: string; agentKind: WhatsappAiAgentKind }
  | { allowed: false; reason: string };

export function getWhatsappAiAccessConfig(): WhatsappAiAccessConfig {
  return {
    enabled: process.env.WHATSAPP_AI_ENABLED === "true",
    webhookToken: process.env.WHATSAPP_AI_WEBHOOK_TOKEN?.trim() || null,
    instanceName: process.env.WHATSAPP_AI_EVOLUTION_INSTANCE?.trim() || null,
    assistantPhones:
      process.env.WHATSAPP_AI_ASSISTANT_PHONES?.trim() ||
      process.env.WHATSAPP_AI_ALLOWED_PHONE?.trim() ||
      null,
    codePhones: process.env.WHATSAPP_AI_CODE_PHONES?.trim() || null,
    legacyAllowedPhone: process.env.WHATSAPP_AI_ALLOWED_PHONE?.trim() || null,
    tenantId: process.env.WHATSAPP_AI_TENANT_ID?.trim() || null,
  };
}

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

export function phoneFromJid(remoteJid: string): string {
  return digitsOnly(remoteJid.split("@")[0] ?? remoteJid);
}

export function allowedPhoneDigitsList(allowedPhones: string | null): string[] {
  if (!allowedPhones) return [];
  return allowedPhones
    .split(",")
    .map((phone) => digitsOnly(phone))
    .filter(Boolean);
}

function matchesAllowedPhone(phone: string, allowedPhones: string | null): boolean {
  const allowedDigitsList = allowedPhoneDigitsList(allowedPhones);
  return allowedDigitsList.some((allowedDigits) => phone.endsWith(allowedDigits));
}

export function resolveAgentKindForPhone(
  remoteJid: string,
  config: Pick<WhatsappAiAccessConfig, "assistantPhones" | "codePhones" | "legacyAllowedPhone">,
): WhatsappAiAccessDecision {
  const phone = phoneFromJid(remoteJid);
  if (!phone) return { allowed: false, reason: "invalid phone" };

  if (matchesAllowedPhone(phone, config.codePhones)) {
    return { allowed: true, phone, agentKind: "claude_code" };
  }

  if (matchesAllowedPhone(phone, config.assistantPhones ?? config.legacyAllowedPhone)) {
    return { allowed: true, phone, agentKind: "assistant" };
  }

  return { allowed: false, reason: "unauthorized sender" };
}

export function isAllowedPhone(remoteJid: string, allowedPhone: string | null): WhatsappAiAccessDecision {
  const legacyConfig = {
    assistantPhones: allowedPhone,
    codePhones: null,
    legacyAllowedPhone: allowedPhone,
  };
  return resolveAgentKindForPhone(remoteJid, legacyConfig);
}

export function validateWhatsappAiInboundAccess(params: {
  config: WhatsappAiAccessConfig;
  instanceName: string | null;
  remoteJid: string;
  fromMe: boolean;
  isGroup: boolean;
  hasText: boolean;
}): WhatsappAiAccessDecision {
  if (!params.config.enabled) return { allowed: false, reason: "disabled" };
  if (!params.config.tenantId) return { allowed: false, reason: "missing tenant id" };
  if (!params.config.instanceName) return { allowed: false, reason: "missing instance" };
  if (params.instanceName !== params.config.instanceName) {
    return { allowed: false, reason: "unexpected instance" };
  }
  if (params.fromMe) return { allowed: false, reason: "from me" };
  if (params.isGroup) return { allowed: false, reason: "group message" };
  if (!params.hasText) return { allowed: false, reason: "empty text" };

  return resolveAgentKindForPhone(params.remoteJid, params.config);
}
