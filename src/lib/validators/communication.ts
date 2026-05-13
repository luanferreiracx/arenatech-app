import { z } from "zod";

// ── Enums ──

export const messageChannelEnum = z.enum(["WHATSAPP", "EMAIL", "SMS"]);
export type MessageChannel = z.infer<typeof messageChannelEnum>;

export const messageStatusEnum = z.enum(["PENDING", "SENT", "DELIVERED", "READ", "FAILED"]);
export type MessageStatus = z.infer<typeof messageStatusEnum>;

export const messageDirectionEnum = z.enum(["OUTBOUND", "INBOUND"]);
export type MessageDirection = z.infer<typeof messageDirectionEnum>;

export const MESSAGE_CHANNEL_LABELS: Record<string, string> = {
  WHATSAPP: "WhatsApp",
  EMAIL: "E-mail",
  SMS: "SMS",
};

export const MESSAGE_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendente",
  SENT: "Enviada",
  DELIVERED: "Entregue",
  READ: "Lida",
  FAILED: "Falhou",
};

export const MESSAGE_STATUS_VARIANT: Record<string, "default" | "success" | "warning" | "destructive" | "info"> = {
  PENDING: "default",
  SENT: "info",
  DELIVERED: "success",
  READ: "success",
  FAILED: "destructive",
};

// ── Send Message ──

export const sendMessageSchema = z.object({
  channel: messageChannelEnum,
  recipientPhone: z.string().max(20).optional().nullable(),
  recipientEmail: z.string().email("Email invalido").max(200).optional().nullable(),
  recipientName: z.string().max(200).optional().nullable(),
  subject: z.string().max(200).optional().nullable(),
  body: z.string().min(1, "Mensagem obrigatoria").max(5000),
  referenceId: z.string().uuid().optional().nullable(),
  referenceType: z.string().max(50).optional().nullable(),
});
export type SendMessageInput = z.infer<typeof sendMessageSchema>;

// ── Send to Customer ──

export const sendToCustomerSchema = z.object({
  customerId: z.string().uuid(),
  channel: messageChannelEnum,
  body: z.string().min(1, "Mensagem obrigatoria").max(5000),
  subject: z.string().max(200).optional().nullable(),
  referenceId: z.string().uuid().optional().nullable(),
  referenceType: z.string().max(50).optional().nullable(),
});
export type SendToCustomerInput = z.infer<typeof sendToCustomerSchema>;

// ── List Messages ──

export const listMessagesSchema = z.object({
  channel: messageChannelEnum.optional(),
  status: messageStatusEnum.optional(),
  direction: messageDirectionEnum.optional(),
  search: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  page: z.number().int().min(0).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
  sortBy: z.enum(["createdAt", "sentAt"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
});
export type ListMessagesInput = z.infer<typeof listMessagesSchema>;

// ── Create Template ──

export const createTemplateSchema = z.object({
  channel: messageChannelEnum,
  name: z.string().min(1, "Nome obrigatorio").max(100),
  slug: z.string().min(1, "Slug obrigatorio").max(100).regex(/^[a-z0-9_-]+$/, "Slug deve ser alfanumerico com hifens"),
  body: z.string().min(1, "Corpo do template obrigatorio").max(5000),
});
export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;

// ── Update Template ──

export const updateTemplateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1, "Nome obrigatorio").max(100),
  body: z.string().min(1, "Corpo do template obrigatorio").max(5000),
  active: z.boolean().optional(),
});
export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;
