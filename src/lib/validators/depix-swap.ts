import { z } from "zod";

/**
 * Swap DePix → L-USDt (Fase 2). O usuário informa quanto de DePix vender.
 * `amountReais` = valor em DePix (1 DePix = R$1 nominal). Convertido para
 * satoshis (×1e8) no service.
 */

export const swapPreviewSchema = z.object({
  amountReais: z.number().positive().max(1_000_000),
});
export type SwapPreviewInput = z.infer<typeof swapPreviewSchema>;

export const swapExecuteSchema = z.object({
  amountReais: z.number().positive().max(1_000_000),
  /** Passphrase da carteira non-custodial (ADR 0051) — assina o PSET. */
  walletPassphrase: z.string().min(1, "Passphrase obrigatória"),
  /** Step-up 2FA: swap move ativo on-chain de forma irreversível. */
  twoFactorCode: z.string().min(6).max(8),
  /**
   * Teto de ágio aceito pelo usuário: preço máximo em DePix por USDt. Guard-rail
   * — o service aborta antes de assinar se o quote ficar acima. Opcional (a UI
   * envia com base no preview + tolerância).
   */
  maxPriceDepixPerUsdt: z.number().positive().optional(),
});
export type SwapExecuteInput = z.infer<typeof swapExecuteSchema>;
