import { z } from "zod";
import { looksLikeLiquidAddress } from "@/lib/validators/depix-onchain";

/**
 * Allowlist de carteiras BYOW (self-custody) do DePix. Cadastrar um endereço é
 * uma operação de CUSTÓDIA de alto risco (define para onde o dinheiro pode ir),
 * então exige confirmação humana forte em DOIS passos:
 *  1. `startAddByowWallet` — senha + step-up 2FA → dispara código no EMAIL e no
 *     WhatsApp do usuário.
 *  2. `confirmAddByowWallet` — os DOIS códigos → grava a carteira.
 * Remover é seguro (só reduz destinos) → exige só step-up 2FA.
 */

const byowAddress = z
  .string()
  .trim()
  .min(1, "Endereco obrigatorio")
  .max(110, "Endereco muito longo")
  .refine(looksLikeLiquidAddress, {
    message: "Endereco Liquid invalido (use um endereco lq1.../ex1... da rede Liquid)",
  });

/** Passo 1: valida senha + 2FA e dispara os códigos de confirmação. */
export const startAddByowWalletSchema = z.object({
  address: byowAddress,
  label: z.string().trim().min(1, "Informe um apelido").max(60),
  isThirdParty: z.boolean().default(false),
  password: z.string().min(1, "Informe sua senha"),
  twoFactorCode: z.string().trim().min(1, "Informe o codigo 2FA").max(20),
});
export type StartAddByowWalletInput = z.infer<typeof startAddByowWalletSchema>;

/** Passo 2: confirma com os códigos de EMAIL e WhatsApp e grava a carteira. */
export const confirmAddByowWalletSchema = z.object({
  address: byowAddress,
  label: z.string().trim().min(1).max(60),
  isThirdParty: z.boolean().default(false),
  emailCode: z.string().trim().min(1, "Informe o codigo do email"),
  whatsappCode: z.string().trim().min(1, "Informe o codigo do WhatsApp"),
});
export type ConfirmAddByowWalletInput = z.infer<typeof confirmAddByowWalletSchema>;

/** Remover (só 2FA — reduz destinos, operação segura). */
export const removeByowWalletSchema = z.object({
  id: z.string().uuid(),
  twoFactorCode: z.string().trim().min(1, "Informe o codigo 2FA").max(20),
});
export type RemoveByowWalletInput = z.infer<typeof removeByowWalletSchema>;
