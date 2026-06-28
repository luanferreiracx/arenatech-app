import { z } from "zod";

/**
 * Validacao leve de endereco Liquid mainnet. A validacao AUTORITATIVA acontece
 * no LWK (`lwk.Address(to)` rejeita invalido antes de assinar) — aqui so barramos
 * lixo obvio cedo (UX). Aceita:
 *   - confidential blech32: `lq1...` (o caso comum, com blinding key)
 *   - unconfidential bech32: `ex1...`
 *   - legacy base58 (P2PKH/P2SH): comeca com `Q`, `G`, `H`, `V`, `P` etc. — por
 *     seguranca, exigimos comprimento minimo e charset.
 */
export function looksLikeLiquidAddress(addr: string): boolean {
  const a = addr.trim();
  if (a.length < 20 || a.length > 110) return false;
  // bech32/blech32 mainnet (lq1 confidential, ex1 unconfidential).
  if (/^(lq1|ex1)[0-9ac-hj-np-z]{20,108}$/i.test(a)) return true;
  // base58 legacy (sem 0, O, I, l) — fallback conservador.
  if (/^[1-9A-HJ-NP-Za-km-z]{26,108}$/.test(a) && /^[GHJPQVX]/.test(a)) return true;
  return false;
}

const liquidAddress = z
  .string()
  .trim()
  .min(1, "Endereco obrigatorio")
  .max(110, "Endereco muito longo")
  .refine(looksLikeLiquidAddress, {
    message: "Endereco Liquid invalido (use um endereco lq1.../ex1... da rede Liquid)",
  });

/**
 * Saque DePix ON-CHAIN para um endereco Liquid externo (Sideswap, hardware
 * wallet, etc). Envio IRREVERSIVEL.
 *
 * Confirmacao: re-digitar um endereco Liquid (60+ chars) e inviavel — o usuario
 * COLA o endereco e CONFERE visualmente num passo de revisao (`acknowledgedAddress`
 * marcado). O servidor exige esse ack; as defesas que importam continuam: 2FA,
 * advisory lock, cap diario, e validacao do endereco aqui + no LWK (`lwk.Address`).
 *
 * `passphrase` so e exigida em carteira non-custodial (o service faz o fail-fast
 * — aqui e opcional).
 */
export const onchainWithdrawSchema = z.object({
  toAddress: liquidAddress,
  /** Valor em reais (= DePix), nao centavos. */
  amountReais: z.number().positive("Valor deve ser maior que zero").max(50000, "Valor maximo R$ 50.000,00"),
  /** Usuario confirmou ter conferido o endereco colado (passo de revisao). */
  acknowledgedAddress: z.literal(true, {
    message: "Confirme que conferiu o endereco de destino",
  }),
  passphrase: z.string().min(1).max(200).optional(),
  /** Step-up 2FA (saque on-chain e irreversivel — mesmo guard do saque PIX). */
  twoFactorCode: z.string().trim().min(1, "Informe o codigo 2FA").max(20),
});

export type OnchainWithdrawInput = z.infer<typeof onchainWithdrawSchema>;
