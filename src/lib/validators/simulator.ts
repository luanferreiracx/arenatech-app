import { z } from "zod";

// ── Simulate ──

export const simulateSchema = z.object({
  valorProduto: z.number().min(0.01, "Valor do produto obrigatorio"),
  valorEntrada: z.number().min(0).optional(),
});
export type SimulateInput = z.infer<typeof simulateSchema>;

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
