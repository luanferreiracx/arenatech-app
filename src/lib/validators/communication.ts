import { z } from "zod";

// ────────────────────────────────────────────────────────────────────────────
// Enums & Labels
// ────────────────────────────────────────────────────────────────────────────

export const messageChannelValues = ["WHATSAPP", "EMAIL", "SMS"] as const;
export const messageStatusValues = ["PENDING", "SENT", "DELIVERED", "READ", "FAILED"] as const;
export const messageDirectionValues = ["OUTBOUND", "INBOUND"] as const;

export const messageChannelLabels: Record<string, string> = {
  WHATSAPP: "WhatsApp",
  EMAIL: "E-mail",
  SMS: "SMS",
};

export const messageStatusLabels: Record<string, string> = {
  PENDING: "Pendente",
  SENT: "Enviada",
  DELIVERED: "Entregue",
  READ: "Lida",
  FAILED: "Falha",
};

export const messageDirectionLabels: Record<string, string> = {
  OUTBOUND: "Enviada",
  INBOUND: "Recebida",
};

// ────────────────────────────────────────────────────────────────────────────
// Send Message
// ────────────────────────────────────────────────────────────────────────────

export const sendMessageSchema = z.object({
  channel: z.enum(messageChannelValues),
  recipientPhone: z.string().max(20).optional(),
  recipientEmail: z.string().max(200).email("E-mail inválido").optional(),
  recipientName: z.string().max(200).optional(),
  subject: z.string().max(200).optional(),
  body: z.string().min(1, "Mensagem obrigatória").max(5000),
  templateName: z.string().optional(),
  templateParams: z.record(z.string(), z.string()).optional(),
  referenceId: z.string().uuid().optional(),
  referenceType: z.string().optional(),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Send to Customer
// ────────────────────────────────────────────────────────────────────────────

export const sendToCustomerSchema = z.object({
  customerId: z.string().uuid(),
  channel: z.enum(messageChannelValues),
  body: z.string().min(1, "Mensagem obrigatória").max(5000),
  subject: z.string().max(200).optional(),
  referenceId: z.string().uuid().optional(),
  referenceType: z.string().optional(),
});

export type SendToCustomerInput = z.infer<typeof sendToCustomerSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Quick Actions
// ────────────────────────────────────────────────────────────────────────────

export const notifyOsSchema = z.object({
  serviceOrderId: z.string().uuid(),
});

export type NotifyOsInput = z.infer<typeof notifyOsSchema>;

export const sendReceiptSchema = z.object({
  referenceId: z.string().uuid(),
  referenceType: z.enum(["service_order", "sale"] as const),
});

export type SendReceiptInput = z.infer<typeof sendReceiptSchema>;

// ────────────────────────────────────────────────────────────────────────────
// List Messages
// ────────────────────────────────────────────────────────────────────────────

export const listMessagesSchema = z.object({
  channel: z.enum(messageChannelValues).optional(),
  status: z.enum(messageStatusValues).optional(),
  search: z.string().optional(),
  referenceId: z.string().uuid().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  page: z.number().int().min(0),
  pageSize: z.number().int().min(1).max(100),
});

export type ListMessagesInput = z.infer<typeof listMessagesSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Templates
// ────────────────────────────────────────────────────────────────────────────

export const createTemplateSchema = z.object({
  channel: z.enum(messageChannelValues),
  name: z.string().min(1, "Nome obrigatório").max(200),
  slug: z
    .string()
    .min(1, "Slug obrigatório")
    .max(100)
    .regex(/^[a-z0-9_]+$/, "Slug deve conter apenas letras minúsculas, números e underline"),
  body: z.string().min(1, "Corpo obrigatório").max(5000),
  active: z.boolean(),
});

export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;

export const updateTemplateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1, "Nome obrigatório").max(200).optional(),
  body: z.string().min(1, "Corpo obrigatório").max(5000).optional(),
  active: z.boolean().optional(),
});

export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;

export const listTemplatesSchema = z.object({
  channel: z.enum(messageChannelValues).optional(),
  active: z.boolean().optional(),
  page: z.number().int().min(0),
  pageSize: z.number().int().min(1).max(100),
});

export type ListTemplatesInput = z.infer<typeof listTemplatesSchema>;
