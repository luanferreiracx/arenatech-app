import { z } from "zod";

export const createServiceSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  basePrice: z.number().min(0),
  active: z.boolean(),
});

export const updateServiceSchema = createServiceSchema.partial();

export type CreateServiceInput = z.infer<typeof createServiceSchema>;
export type UpdateServiceInput = z.infer<typeof updateServiceSchema>;

export const createDiagnosticTemplateSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1),
  category: z.string().optional(),
  active: z.boolean(),
});

export const updateDiagnosticTemplateSchema = createDiagnosticTemplateSchema.partial();

export type CreateDiagnosticTemplateInput = z.infer<typeof createDiagnosticTemplateSchema>;
export type UpdateDiagnosticTemplateInput = z.infer<typeof updateDiagnosticTemplateSchema>;

export const createDeviceCategorySchema = z.object({
  name: z.string().min(1).max(100),
});

export type CreateDeviceCategoryInput = z.infer<typeof createDeviceCategorySchema>;

export const createDeviceSchema = z.object({
  categoryId: z.string().uuid().optional(),
  brand: z.string().min(1).max(100),
  model: z.string().min(1).max(200),
  attributes: z.string().optional(), // JSON string — parsed/validated separately
  active: z.boolean(),
});

export const updateDeviceSchema = createDeviceSchema.partial();

export type CreateDeviceInput = z.infer<typeof createDeviceSchema>;
export type UpdateDeviceInput = z.infer<typeof updateDeviceSchema>;

export const listPaginationSchema = z.object({
  search: z.string().optional(),
  page: z.number().int().min(0),
  pageSize: z.number().int().min(1).max(100),
});

export type ListPaginationInput = z.infer<typeof listPaginationSchema>;
