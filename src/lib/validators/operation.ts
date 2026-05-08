import { z } from "zod";

// ────────────────────────────────────────────────────────────────────────────
// Enums & Labels
// ────────────────────────────────────────────────────────────────────────────

export const labOrderStatusValues = [
  "SENT",
  "RECEIVED",
  "IN_PROGRESS",
  "COMPLETED",
  "RETURNED",
  "CANCELLED",
] as const;

export const labOrderStatusLabels: Record<string, string> = {
  SENT: "Enviado",
  RECEIVED: "Recebido",
  IN_PROGRESS: "Em Andamento",
  COMPLETED: "Concluído",
  RETURNED: "Devolvido",
  CANCELLED: "Cancelado",
};

export const serviceProviderTypeValues = [
  "technician",
  "consultant",
  "partner",
] as const;

export const serviceProviderTypeLabels: Record<string, string> = {
  technician: "Técnico",
  consultant: "Consultor",
  partner: "Parceiro",
};

// ────────────────────────────────────────────────────────────────────────────
// Delivery Person
// ────────────────────────────────────────────────────────────────────────────

export const createDeliveryPersonSchema = z.object({
  name: z.string().min(1, "Nome obrigatório").max(200),
  phone: z.string().max(20).optional(),
  email: z.union([z.string().email("Email inválido"), z.literal("")]).optional(),
  active: z.boolean(),
  notes: z.string().max(500).optional(),
});

export const updateDeliveryPersonSchema = createDeliveryPersonSchema.partial();

export type CreateDeliveryPersonInput = z.infer<typeof createDeliveryPersonSchema>;
export type UpdateDeliveryPersonInput = z.infer<typeof updateDeliveryPersonSchema>;

export const listDeliveryPersonsSchema = z.object({
  search: z.string().optional(),
  active: z.boolean().optional(),
  page: z.number().int().min(0),
  pageSize: z.number().int().min(1).max(100),
});

export type ListDeliveryPersonsInput = z.infer<typeof listDeliveryPersonsSchema>;

// ────────────────────────────────────────────────────────────────────────────
// External Lab
// ────────────────────────────────────────────────────────────────────────────

export const createExternalLabSchema = z.object({
  name: z.string().min(1, "Nome obrigatório").max(200),
  contact: z.string().max(200).optional(),
  phone: z.string().max(20).optional(),
  email: z.union([z.string().email("Email inválido"), z.literal("")]).optional(),
  address: z.record(z.string(), z.unknown()).optional(),
  active: z.boolean(),
  notes: z.string().max(500).optional(),
});

export const updateExternalLabSchema = createExternalLabSchema.partial();

export type CreateExternalLabInput = z.infer<typeof createExternalLabSchema>;
export type UpdateExternalLabInput = z.infer<typeof updateExternalLabSchema>;

export const listExternalLabsSchema = z.object({
  search: z.string().optional(),
  active: z.boolean().optional(),
  page: z.number().int().min(0),
  pageSize: z.number().int().min(1).max(100),
});

export type ListExternalLabsInput = z.infer<typeof listExternalLabsSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Lab Order
// ────────────────────────────────────────────────────────────────────────────

export const createLabOrderSchema = z.object({
  labId: z.string().uuid("Laboratório obrigatório"),
  serviceOrderId: z.string().uuid().optional(),
  deliveryPersonId: z.string().uuid().optional(),
  deviceDescription: z.string().max(500).optional(),
  problem: z.string().max(2000).optional(),
  estimatedCost: z.number().min(0).optional(),
  notes: z.string().max(2000).optional(),
});

export type CreateLabOrderInput = z.infer<typeof createLabOrderSchema>;

export const updateLabOrderStatusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(labOrderStatusValues),
  finalCost: z.number().min(0).optional(),
  notes: z.string().max(2000).optional(),
});

export type UpdateLabOrderStatusInput = z.infer<typeof updateLabOrderStatusSchema>;

export const listLabOrdersSchema = z.object({
  status: z.enum(labOrderStatusValues).optional(),
  labId: z.string().uuid().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  page: z.number().int().min(0),
  pageSize: z.number().int().min(1).max(100),
});

export type ListLabOrdersInput = z.infer<typeof listLabOrdersSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Service Provider
// ────────────────────────────────────────────────────────────────────────────

export const createServiceProviderSchema = z.object({
  name: z.string().min(1, "Nome obrigatório").max(200),
  type: z.enum(serviceProviderTypeValues),
  cpfCnpj: z.string().max(18).optional(),
  phone: z.string().max(20).optional(),
  email: z.union([z.string().email("Email inválido"), z.literal("")]).optional(),
  commissionRate: z.number().min(0).max(100).optional(),
  contractDetails: z.record(z.string(), z.unknown()).optional(),
  active: z.boolean(),
  notes: z.string().max(500).optional(),
});

export const updateServiceProviderSchema = createServiceProviderSchema.partial();

export type CreateServiceProviderInput = z.infer<typeof createServiceProviderSchema>;
export type UpdateServiceProviderInput = z.infer<typeof updateServiceProviderSchema>;

export const listServiceProvidersSchema = z.object({
  search: z.string().optional(),
  type: z.enum(serviceProviderTypeValues).optional(),
  active: z.boolean().optional(),
  page: z.number().int().min(0),
  pageSize: z.number().int().min(1).max(100),
});

export type ListServiceProvidersInput = z.infer<typeof listServiceProvidersSchema>;
