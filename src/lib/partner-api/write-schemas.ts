/**
 * Schemas de entrada das rotas de ESCRITA da API de parceiros (ADR 0057, Fase 3).
 * Validados na borda REST antes de chamar os services internos.
 */
import { z } from "zod";
import { isValidTaxId } from "@/lib/utils/tax-id";
import { hasControlChars } from "@/lib/utils/sanitize-line";
import { looksLikeLiquidAddress } from "@/lib/validators/depix-onchain";

/** Texto livre de uma linha (nome/descrição): rejeita controles/BIDI (anti-injeção
 *  em log/CSV/exibição por input externo — auditoria WH-6). Rejeita com 400 claro
 *  em vez de mutar (mais adequado a API); e continua representável em JSON Schema
 *  (a geração do OpenAPI usa toJSONSchema, que não aceita .transform). */
const sanitizedLine = (max: number) =>
  z.string().max(max).refine((s) => !hasControlChars(s), {
    message: "Não são permitidos caracteres de controle/quebra de linha.",
  });

/** POST /depix/deposits — gera QR de cobrança. */
export const partnerDepositSchema = z.object({
  /** Valor em centavos (R$ 10,00 a R$ 5.000,00 — limites operacionais DePix). */
  amountCents: z.number().int().min(1000).max(500000),
  /** CPF/CNPJ do pagador — OBRIGATÓRIO para qualquer valor (exigência da Eulen). */
  payerTaxId: z.string().min(11).max(18),
  /** Descrição livre (aparece no registro). */
  description: sanitizedLine(200).optional().nullable(),
  /**
   * BYOW (self-custody): endereço Liquid PRÓPRIO onde receber o DePix, em vez da
   * carteira gerenciada. PRECISA estar cadastrado na allowlist do tenant (painel,
   * com 2FA+email+WhatsApp) — senão o depósito é barrado (400). Ausente = carteira
   * gerenciada (fluxo atual). Formato validado na borda (defense-in-depth; a
   * allowlist é a barreira autoritativa).
   */
  depositAddress: z
    .string()
    .trim()
    .min(20)
    .max(110)
    .refine(looksLikeLiquidAddress, { message: "Endereço Liquid inválido" })
    .optional()
    .nullable(),
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
  // Formato por-tipo é validado no fluxo interno (formatPixKey, antes da Eulen).
  pixKey: z.string().min(1).max(255),
  recipientName: sanitizedLine(200).optional().nullable(),
  recipientTaxId: z.string().min(11).max(18).refine(isValidTaxId, { message: "CPF/CNPJ inválido" }),
});
export type PartnerWithdrawInput = z.infer<typeof partnerWithdrawSchema>;
