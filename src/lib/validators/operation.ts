import { z } from "zod";

// Email opcional que aceita string vazia. `z.string().email()` rejeita "" (o
// default comum de inputs vazios), o que travava o submit em silencio — era o
// bug que fazia o email "parecer" obrigatorio em labs/entregadores. Aqui o tipo
// de entrada continua `string` (RHF infere certo) e o formato so e cobrado
// quando ha conteudo.
const optionalEmail = z
  .string()
  .max(200)
  .optional()
  .nullable()
  .refine((v) => !v || z.string().email().safeParse(v).success, {
    message: "Email invalido",
  });

// ── Enums ──

export const labOrderStatusEnum = z.enum([
  "SENT",
  "RECEIVED",
  "IN_PROGRESS",
  "COMPLETED",
  "RETURNED",
  "CANCELLED",
]);
export type LabOrderStatus = z.infer<typeof labOrderStatusEnum>;

export const LAB_ORDER_STATUS_LABELS: Record<string, string> = {
  SENT: "Enviado",
  RECEIVED: "Recebido",
  IN_PROGRESS: "Em Andamento",
  COMPLETED: "Concluido",
  RETURNED: "Devolvido",
  CANCELLED: "Cancelado",
};

export const LAB_ORDER_STATUS_VARIANT: Record<string, "default" | "success" | "warning" | "destructive" | "info"> = {
  SENT: "default",
  RECEIVED: "info",
  IN_PROGRESS: "warning",
  COMPLETED: "success",
  RETURNED: "success",
  CANCELLED: "destructive",
};

// ── Delivery Person ──

export const createDeliveryPersonSchema = z.object({
  name: z.string().min(1, "Nome obrigatorio").max(200),
  phone: z.string().max(20).optional().nullable(),
  email: optionalEmail,
  notes: z.string().max(1000).optional().nullable(),
});
export type CreateDeliveryPersonInput = z.infer<typeof createDeliveryPersonSchema>;

export const updateDeliveryPersonSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1, "Nome obrigatorio").max(200),
  phone: z.string().max(20).optional().nullable(),
  email: optionalEmail,
  active: z.boolean().optional(),
  notes: z.string().max(1000).optional().nullable(),
});
export type UpdateDeliveryPersonInput = z.infer<typeof updateDeliveryPersonSchema>;

// ── External Lab ──

export const createExternalLabSchema = z.object({
  name: z.string().min(1, "Nome obrigatorio").max(200),
  contact: z.string().max(200).optional().nullable(),
  phone: z.string().max(20).optional().nullable(),
  email: optionalEmail,
  address: z.object({
    street: z.string().optional(),
    number: z.string().optional(),
    complement: z.string().optional(),
    neighborhood: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    zipCode: z.string().optional(),
  }).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});
export type CreateExternalLabInput = z.infer<typeof createExternalLabSchema>;

export const updateExternalLabSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1, "Nome obrigatorio").max(200),
  contact: z.string().max(200).optional().nullable(),
  phone: z.string().max(20).optional().nullable(),
  email: optionalEmail,
  address: z.object({
    street: z.string().optional(),
    number: z.string().optional(),
    complement: z.string().optional(),
    neighborhood: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    zipCode: z.string().optional(),
  }).optional().nullable(),
  active: z.boolean().optional(),
  notes: z.string().max(1000).optional().nullable(),
});
export type UpdateExternalLabInput = z.infer<typeof updateExternalLabSchema>;

// ── Lab Order ──

export const createLabOrderSchema = z.object({
  labId: z.string().uuid(),
  serviceOrderId: z.string().uuid().optional().nullable(),
  deliveryPersonId: z.string().uuid().optional().nullable(),
  deviceDescription: z.string().max(300).optional().nullable(),
  problem: z.string().max(1000).optional().nullable(),
  estimatedCost: z.number().int().min(0).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});
export type CreateLabOrderInput = z.infer<typeof createLabOrderSchema>;

export const updateLabOrderStatusSchema = z.object({
  id: z.string().uuid(),
  status: labOrderStatusEnum,
  finalCost: z.number().int().min(0).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});
export type UpdateLabOrderStatusInput = z.infer<typeof updateLabOrderStatusSchema>;

// ── Service Provider ──

export const createServiceProviderSchema = z.object({
  name: z.string().min(1, "Nome obrigatorio").max(200),
  type: z.string().min(1, "Tipo obrigatorio").max(50),
  cpfCnpj: z.string().max(18).optional().nullable(),
  phone: z.string().max(20).optional().nullable(),
  email: optionalEmail,
  commissionRate: z.number().min(0).max(100).optional().nullable(),
  contractDetails: z.record(z.string(), z.unknown()).optional().nullable(),
  isTechnician: z.boolean().optional(),
  notes: z.string().max(1000).optional().nullable(),
});
export type CreateServiceProviderInput = z.infer<typeof createServiceProviderSchema>;

export const updateServiceProviderSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1, "Nome obrigatorio").max(200),
  type: z.string().min(1, "Tipo obrigatorio").max(50),
  cpfCnpj: z.string().max(18).optional().nullable(),
  phone: z.string().max(20).optional().nullable(),
  email: optionalEmail,
  commissionRate: z.number().min(0).max(100).optional().nullable(),
  contractDetails: z.record(z.string(), z.unknown()).optional().nullable(),
  active: z.boolean().optional(),
  isTechnician: z.boolean().optional(),
  notes: z.string().max(1000).optional().nullable(),
});
export type UpdateServiceProviderInput = z.infer<typeof updateServiceProviderSchema>;

// ── List ──

export const listDeliveryPersonsSchema = z.object({
  active: z.boolean().optional(),
  search: z.string().optional(),
});
export type ListDeliveryPersonsInput = z.infer<typeof listDeliveryPersonsSchema>;

export const listExternalLabsSchema = z.object({
  active: z.boolean().optional(),
  search: z.string().optional(),
});
export type ListExternalLabsInput = z.infer<typeof listExternalLabsSchema>;

export const listLabOrdersSchema = z.object({
  status: labOrderStatusEnum.optional(),
  labId: z.string().uuid().optional(),
  page: z.number().int().min(0).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
});
export type ListLabOrdersInput = z.infer<typeof listLabOrdersSchema>;

export const listServiceProvidersSchema = z.object({
  active: z.boolean().optional(),
  search: z.string().optional(),
  type: z.string().optional(),
});
export type ListServiceProvidersInput = z.infer<typeof listServiceProvidersSchema>;
