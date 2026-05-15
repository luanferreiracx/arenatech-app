import { z } from "zod";

// ── Service schemas ──

export const createServiceSchema = z.object({
  serviceType: z.string().min(1, "Tipo de servico obrigatorio").max(255),
  deviceModel: z.string().min(1, "Modelo do aparelho obrigatorio").max(255),
  description: z.string().max(2000).optional(),
  basePrice: z.number().int().min(0, "Preco deve ser positivo"), // centavos
  estimatedTime: z.string().max(100).optional(),
});

export type CreateServiceInput = z.infer<typeof createServiceSchema>;

export const updateServiceSchema = z.object({
  id: z.string().uuid(),
  serviceType: z.string().min(1, "Tipo de servico obrigatorio").max(255),
  deviceModel: z.string().min(1, "Modelo do aparelho obrigatorio").max(255),
  description: z.string().max(2000).optional(),
  basePrice: z.number().int().min(0, "Preco deve ser positivo"), // centavos
  estimatedTime: z.string().max(100).optional(),
});

export type UpdateServiceInput = z.infer<typeof updateServiceSchema>;

export const listServicesSchema = z.object({
  search: z.string().optional(),
  serviceType: z.string().optional(),
  deviceModel: z.string().optional(),
  active: z.boolean().optional(),
  page: z.number().int().min(0).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
});

export type ListServicesInput = z.infer<typeof listServicesSchema>;

export const bulkAdjustSchema = z.object({
  serviceType: z.string().min(1),
  adjustmentCents: z.number().int(), // positive = increase, negative = decrease
});

export type BulkAdjustInput = z.infer<typeof bulkAdjustSchema>;

export const renameTypeSchema = z.object({
  oldName: z.string().min(1),
  newName: z.string().min(1).max(255),
});

export type RenameTypeInput = z.infer<typeof renameTypeSchema>;

export const duplicateTypeSchema = z.object({
  sourceType: z.string().min(1),
  newType: z.string().min(1).max(255),
});

export type DuplicateTypeInput = z.infer<typeof duplicateTypeSchema>;

export const sendServiceWhatsAppSchema = z.object({
  serviceId: z.string().uuid(),
  clientName: z.string().min(1, "Nome do cliente obrigatorio").max(255),
  clientPhone: z.string().min(10, "Telefone invalido").max(20),
});

export type SendServiceWhatsAppInput = z.infer<typeof sendServiceWhatsAppSchema>;

// ── DiagnosticTemplate schemas ──

export const createDiagnosticTemplateSchema = z.object({
  title: z.string().min(1, "Titulo obrigatorio").max(255),
  content: z.string().min(1, "Conteudo obrigatorio").max(5000),
  category: z.string().max(100).optional(),
});

export type CreateDiagnosticTemplateInput = z.infer<typeof createDiagnosticTemplateSchema>;

export const updateDiagnosticTemplateSchema = createDiagnosticTemplateSchema.extend({
  id: z.string().uuid(),
});

export type UpdateDiagnosticTemplateInput = z.infer<typeof updateDiagnosticTemplateSchema>;

export const listDiagnosticTemplatesSchema = z.object({
  search: z.string().optional(),
  category: z.string().optional(),
  active: z.boolean().optional(),
  page: z.number().int().min(0).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
});

export type ListDiagnosticTemplatesInput = z.infer<typeof listDiagnosticTemplatesSchema>;

// ── DeviceCategory schemas ──

export const createDeviceCategorySchema = z.object({
  name: z.string().min(1, "Nome obrigatorio").max(100),
});

export type CreateDeviceCategoryInput = z.infer<typeof createDeviceCategorySchema>;

export const updateDeviceCategorySchema = createDeviceCategorySchema.extend({
  id: z.string().uuid(),
});

export type UpdateDeviceCategoryInput = z.infer<typeof updateDeviceCategorySchema>;

// ── Device schemas ──

export const createDeviceSchema = z.object({
  categoryId: z.string().uuid().optional().nullable(),
  brand: z.string().min(1, "Marca obrigatoria").max(100),
  model: z.string().min(1, "Modelo obrigatorio").max(200),
  attributes: z.record(z.string(), z.string()).optional(),
});

export type CreateDeviceInput = z.infer<typeof createDeviceSchema>;

export const updateDeviceSchema = createDeviceSchema.extend({
  id: z.string().uuid(),
});

export type UpdateDeviceInput = z.infer<typeof updateDeviceSchema>;

export const listDevicesSchema = z.object({
  search: z.string().optional(),
  categoryId: z.string().uuid().optional(),
  active: z.boolean().optional(),
  page: z.number().int().min(0).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
});

export type ListDevicesInput = z.infer<typeof listDevicesSchema>;

// ── ServiceObservation schemas ──

export const createServiceObservationSchema = z.object({
  title: z.string().min(1, "Titulo obrigatorio").max(100),
  observation: z.string().min(1, "Observacao obrigatoria"),
  serviceTypes: z.array(z.string()).optional().nullable(),
  deviceModels: z.array(z.string()).optional().nullable(),
});
export type CreateServiceObservationInput = z.infer<typeof createServiceObservationSchema>;

export const updateServiceObservationSchema = createServiceObservationSchema.extend({
  id: z.string().uuid(),
});
export type UpdateServiceObservationInput = z.infer<typeof updateServiceObservationSchema>;

export const listServiceObservationsSchema = z.object({
  active: z.boolean().optional(),
  serviceType: z.string().optional(),
  deviceModel: z.string().optional(),
});
export type ListServiceObservationsInput = z.infer<typeof listServiceObservationsSchema>;
