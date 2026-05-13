import { z } from "zod";

// ── Create Valuation ──

export const createValuationSchema = z.object({
  modelo: z.string().min(1, "Modelo obrigatorio").max(100),
  armazenamento: z.string().min(1, "Armazenamento obrigatorio").max(50),
  saudeBateria: z.string().min(1, "Saude da bateria obrigatoria").max(50),
  valor: z.number().int().min(0, "Valor deve ser positivo"), // centavos
  validadeDias: z.number().int().min(1).max(365).optional(),
});
export type CreateValuationInput = z.infer<typeof createValuationSchema>;

// ── Update Valuation ──

export const updateValuationSchema = z.object({
  id: z.string().uuid(),
  modelo: z.string().min(1, "Modelo obrigatorio").max(100),
  armazenamento: z.string().min(1, "Armazenamento obrigatorio").max(50),
  saudeBateria: z.string().min(1, "Saude da bateria obrigatoria").max(50),
  valor: z.number().int().min(0, "Valor deve ser positivo"), // centavos
  validadeDias: z.number().int().min(1).max(365).optional(),
});
export type UpdateValuationInput = z.infer<typeof updateValuationSchema>;

// ── List Valuations ──

export const listValuationsSchema = z.object({
  modelo: z.string().optional(),
  armazenamento: z.string().optional(),
  page: z.number().int().min(0).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
});
export type ListValuationsInput = z.infer<typeof listValuationsSchema>;

// ── Bulk Adjust ──

export const bulkAdjustSchema = z.object({
  modelo: z.string().min(1, "Modelo obrigatorio"),
  adjustPercent: z.number().min(-100).max(1000), // percentage adjustment
});
export type BulkAdjustInput = z.infer<typeof bulkAdjustSchema>;

// ── Duplicate Model ──

export const duplicateModelSchema = z.object({
  sourceModelo: z.string().min(1, "Modelo de origem obrigatorio"),
  targetModelo: z.string().min(1, "Modelo de destino obrigatorio"),
});
export type DuplicateModelInput = z.infer<typeof duplicateModelSchema>;

// ── Constants ──

export const STORAGE_OPTIONS = [
  "32GB",
  "64GB",
  "128GB",
  "256GB",
  "512GB",
  "1TB",
  "2TB",
];

export const BATTERY_HEALTH_OPTIONS = [
  "> 90%",
  "85% - 90%",
  "80% - 85%",
  "< 80%",
  "-",
];
