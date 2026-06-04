export type WhatsappAiAccessConfig = {
  enabled: boolean;
  webhookToken: string | null;
  instanceName: string | null;
  allowedPhone: string | null;
  tenantId: string | null;
};

export type WhatsappAiAccessDecision =
  | { allowed: true; phone: string }
  | { allowed: false; reason: string };

export function getWhatsappAiAccessConfig(): WhatsappAiAccessConfig {
  return {
    enabled: process.env.WHATSAPP_AI_ENABLED === "true",
    webhookToken: process.env.WHATSAPP_AI_WEBHOOK_TOKEN?.trim() || null,
    instanceName: process.env.WHATSAPP_AI_EVOLUTION_INSTANCE?.trim() || null,
    allowedPhone: process.env.WHATSAPP_AI_ALLOWED_PHONE?.trim() || null,
    tenantId: process.env.WHATSAPP_AI_TENANT_ID?.trim() || null,
  };
}

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

export function phoneFromJid(remoteJid: string): string {
  return digitsOnly(remoteJid.split("@")[0] ?? remoteJid);
}

export function isAllowedPhone(remoteJid: string, allowedPhone: string | null): WhatsappAiAccessDecision {
  if (!allowedPhone) return { allowed: false, reason: "missing allowed phone" };

  const phone = phoneFromJid(remoteJid);
  const allowedDigits = digitsOnly(allowedPhone);
  if (!phone || !allowedDigits) return { allowed: false, reason: "invalid phone" };

  if (!phone.endsWith(allowedDigits)) {
    return { allowed: false, reason: "unauthorized sender" };
  }

  return { allowed: true, phone };
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

  return isAllowedPhone(params.remoteJid, params.config.allowedPhone);
}
