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
  // A tela de Avaliacoes e uma matriz completa por modelo (sem paginacao na UI):
  // ela agrupa todas as linhas no cliente. Com 30+ modelos x 8 precos a tabela
  // passa de 100 linhas e o corte por pageSize escondia modelos inteiros. `all`
  // ignora a paginacao e devolve a tabela inteira do tenant (que e pequena).
  all: z.boolean().optional(),
});
export type ListValuationsInput = z.infer<typeof listValuationsSchema>;

// ── Bulk Adjust (percentage) ──

export const bulkAdjustSchema = z.object({
  modelo: z.string().min(1, "Modelo obrigatorio"),
  adjustPercent: z.number().min(-100).max(1000), // percentage adjustment
});
export type BulkAdjustInput = z.infer<typeof bulkAdjustSchema>;

// ── Bulk Adjust Fixed (R$ amount, like Laravel) ──

export const bulkAdjustFixedSchema = z.object({
  modelo: z.string().min(1, "Modelo obrigatorio"),
  adjustAmount: z.number().int(), // centavos (positive = increase, negative = decrease)
});
export type BulkAdjustFixedInput = z.infer<typeof bulkAdjustFixedSchema>;

// ── Duplicate Model ──

export const duplicateModelSchema = z.object({
  sourceModelo: z.string().min(1, "Modelo de origem obrigatorio"),
  targetModelo: z.string().min(1, "Modelo de destino obrigatorio"),
});
export type DuplicateModelInput = z.infer<typeof duplicateModelSchema>;

// ── Delete all valuations of a model ──

export const deleteModelSchema = z.object({
  modelo: z.string().min(1, "Modelo obrigatorio"),
});
export type DeleteModelInput = z.infer<typeof deleteModelSchema>;

// ── Send WhatsApp ──

export const sendValuationWhatsAppSchema = z.object({
  phone: z.string().min(10, "Telefone obrigatorio"),
  modelo: z.string().min(1, "Modelo obrigatorio"),
  customerName: z.string().max(255).optional(),
});
export type SendValuationWhatsAppInput = z.infer<typeof sendValuationWhatsAppSchema>;

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
