import { z } from "zod";

/** Config de taxa DePix editavel por tenant. Fixos em centavos, percentuais 0-100. */
export const updateDepixFeeConfigSchema = z.object({
  entryFeeFixed: z.number().int().min(0).max(100000), // ate R$ 1.000 em centavos
  entryFeePercent: z.number().min(0).max(100),
  exitFeeFixed: z.number().int().min(0).max(100000),
  exitFeePercent: z.number().min(0).max(100),
});

export type UpdateDepixFeeConfigInput = z.infer<typeof updateDepixFeeConfigSchema>;

export const DEFAULT_DEPIX_FEE = {
  entryFeeFixed: 99,
  entryFeePercent: 1.5,
  exitFeeFixed: 99,
  exitFeePercent: 1.7,
} as const;
