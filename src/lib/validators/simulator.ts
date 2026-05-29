import { z } from "zod";

// ── Simulate ──

export const simulateSchema = z.object({
  valorProduto: z.number().min(0.01, "Valor do produto obrigatorio"),
  valorEntrada: z.number().min(0).optional(),
});
export type SimulateInput = z.infer<typeof simulateSchema>;

// ── Rate config (taxas exibidas ao cliente) ──

export const simulatorTierSchema = z.object({
  installments: z.number().int().min(2).max(36),
  feePercent: z.number().min(0).max(99.99),
});

export const updateSimulatorConfigSchema = z.object({
  creditAvistaFeePercent: z.number().min(0).max(99.99),
  debitFeePercent: z.number().min(0).max(99.99),
  maxInstallments: z.number().int().min(2).max(36),
  tiers: z.array(simulatorTierSchema).max(35),
});
export type UpdateSimulatorConfigInput = z.infer<
  typeof updateSimulatorConfigSchema
>;

// ── Result types (not input schemas, just for reference) ──

export interface SimulationResult {
  valorProduto: number;
  valorEntrada: number;
  valorFinanciar: number;
  debito: { taxa: number; total: number };
  avista: { taxa: number; total: number };
  parcelas: Array<{
    n: number;
    taxa: number;
    total: number;
    parcela: number;
  }>;
  maxParcelas: number;
}
