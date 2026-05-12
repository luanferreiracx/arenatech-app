import { z } from "zod";

// ── Service schemas ──

export const createServiceSchema = z.object({
  name: z.string().min(1, "Nome obrigatorio").max(255),
  description: z.string().max(2000).optional(),
  basePrice: z.number().int().min(0, "Preco deve ser positivo"), // centavos
  estimatedTime: z.string().max(100).optional(),
});

export type CreateServiceInput = z.infer<typeof createServiceSchema>;

export const updateServiceSchema = createServiceSchema.extend({
  id: z.string().uuid(),
});

export type UpdateServiceInput = z.infer<typeof updateServiceSchema>;

export const listServicesSchema = z.object({
  search: z.string().optional(),
  active: z.boolean().optional(),
  page: z.number().int().min(0).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
});

export type ListServicesInput = z.infer<typeof listServicesSchema>;

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
