/**
 * Schemas de entrada das rotas de ESCRITA da API de parceiros (ADR 0057, Fase 3).
 * Validados na borda REST antes de chamar os services internos.
 */
import { z } from "zod";
import { isValidTaxId } from "@/lib/utils/tax-id";

/** POST /depix/deposits — gera QR de cobrança. */
export const partnerDepositSchema = z.object({
  /** Valor em centavos (R$ 10,00 a R$ 5.000,00 — limites operacionais DePix). */
  amountCents: z.number().int().min(1000).max(500000),
  /** CPF/CNPJ do pagador — OBRIGATÓRIO para qualquer valor (exigência da Eulen). */
  payerTaxId: z.string().min(11).max(18),
  /** Descrição livre (aparece no registro). */
  description: z.string().max(200).optional().nullable(),
  /**
   * BYOW (self-custody): endereço Liquid PRÓPRIO onde receber o DePix, em vez da
   * carteira gerenciada. PRECISA estar cadastrado na allowlist do tenant (painel,
   * com 2FA+email+WhatsApp) — senão o depósito é barrado (400). Ausente = carteira
   * gerenciada (fluxo atual).
   */
  depositAddress: z.string().trim().max(110).optional().nullable(),
}).superRefine((v, ctx) => {
  if (!isValidTaxId(v.payerTaxId)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["payerTaxId"], message: "CPF/CNPJ inválido" });
  }
});
export type PartnerDepositInput = z.infer<typeof partnerDepositSchema>;

/**
 * POST /depix/withdrawals — saque via PIX (off-ramp Eulen) APENAS.
 *
 * Saque ON-CHAIN (envio Liquid direto pela LWK) NÃO é exposto na API de
 * parceiros: é irreversível, para endereço arbitrário e sem 2FA — risco
 * desproporcional para uma chave de máquina. On-chain segue disponível só no
 * PAINEL (humano + step-up 2FA + confirmação de endereço). O PIX mantém
 * rastreabilidade (CPF do destinatário) e o mecanismo de disputa do PIX.
 */
export const partnerWithdrawSchema = z.object({
  method: z.literal("pix"),
  /** Valor LÍQUIDO que o destinatário recebe (centavos). */
  amountCents: z.number().int().min(1000).max(500000),
  pixKeyType: z.enum(["RANDOM", "CPF", "CNPJ", "EMAIL", "PHONE"]),
  pixKey: z.string().min(1).max(255),
  recipientName: z.string().max(200).optional().nullable(),
  recipientTaxId: z.string().min(11).max(18).refine(isValidTaxId, { message: "CPF/CNPJ inválido" }),
});
export type PartnerWithdrawInput = z.infer<typeof partnerWithdrawSchema>;
