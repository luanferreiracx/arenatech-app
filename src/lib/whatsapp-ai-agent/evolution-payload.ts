export type WhatsappAiInboundAttachment = {
  kind: "image";
  url: string;
  mimeType: string | null;
  caption: string | null;
  fileLength: number | null;
};

export type WhatsappAiInboundMessage = {
  event: string;
  instanceName: string | null;
  messageId: string;
  remoteJid: string;
  fromMe: boolean;
  isGroup: boolean;
  pushName: string | null;
  text: string;
  attachments: WhatsappAiInboundAttachment[];
  timestamp: Date;
};

type EvolutionImageMessage = {
  caption?: unknown;
  url?: unknown;
  mimetype?: unknown;
  mimeType?: unknown;
  fileLength?: unknown;
};

export type EvolutionWebhookPayload = {
  event?: unknown;
  instance?: unknown;
  instanceName?: unknown;
  data?: {
    instance?: unknown;
    key?: {
      id?: unknown;
      remoteJid?: unknown;
      fromMe?: unknown;
      participant?: unknown;
    };
    message?: {
      conversation?: unknown;
      extendedTextMessage?: { text?: unknown };
      imageMessage?: EvolutionImageMessage;
      videoMessage?: { caption?: unknown };
      documentMessage?: { caption?: unknown };
    };
    messageTimestamp?: unknown;
    pushName?: unknown;
  };
};

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function dateFromEvolutionTimestamp(value: unknown): Date {
  if (typeof value === "number" && Number.isFinite(value)) return new Date(value * 1000);
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return new Date(parsed * 1000);
  }
  return new Date();
}

export function extractEvolutionInstance(payload: EvolutionWebhookPayload): string | null {
  return (
    stringOrNull(payload.instance) ??
    stringOrNull(payload.instanceName) ??
    stringOrNull(payload.data?.instance)
  );
}

function extractImageAttachment(imageMessage: EvolutionImageMessage | undefined): WhatsappAiInboundAttachment | null {
  const url = stringOrNull(imageMessage?.url);
  if (!url) return null;

  return {
    kind: "image",
    url,
    mimeType: stringOrNull(imageMessage?.mimetype) ?? stringOrNull(imageMessage?.mimeType),
    caption: stringOrNull(imageMessage?.caption),
    fileLength: numberOrNull(imageMessage?.fileLength),
  };
}

export function parseEvolutionAiInbound(payload: EvolutionWebhookPayload): WhatsappAiInboundMessage | null {
  const event = String(payload.event ?? "");
  if (event !== "messages.upsert" && event !== "MESSAGES_UPSERT") return null;

  const key = payload.data?.key;
  const messageId = stringOrNull(key?.id);
  const remoteJid = stringOrNull(key?.remoteJid);
  if (!messageId || !remoteJid) return null;

  const message = payload.data?.message;
  const text =
    stringOrNull(message?.conversation) ??
    stringOrNull(message?.extendedTextMessage?.text) ??
    stringOrNull(message?.imageMessage?.caption) ??
    stringOrNull(message?.videoMessage?.caption) ??
    stringOrNull(message?.documentMessage?.caption) ??
    "";
  const imageAttachment = extractImageAttachment(message?.imageMessage);

  return {
    event,
    instanceName: extractEvolutionInstance(payload),
    messageId,
    remoteJid,
    fromMe: key?.fromMe === true,
    isGroup: remoteJid.endsWith("@g.us"),
    pushName: stringOrNull(payload.data?.pushName),
    text: text.trim(),
    attachments: imageAttachment ? [imageAttachment] : [],
    timestamp: dateFromEvolutionTimestamp(payload.data?.messageTimestamp),
  };
}
