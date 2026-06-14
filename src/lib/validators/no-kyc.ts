/**
 * Validators do onboarding NO-KYC (ADR 0050, Fase 3).
 *
 * Fluxo público multi-etapa: (1) cadastro só com nome/email/telefone/senha →
 * (2) verifica email por código → (3) verifica telefone por código →
 * aguardando aprovação do superadmin. Sem CPF/CNPJ.
 */
import { z } from "zod";

/** Senha do auto-cadastro: mínimo 8, com ao menos uma letra e um dígito. */
const passwordSchema = z
  .string()
  .min(8, "A senha deve ter ao menos 8 caracteres")
  .max(72, "Senha muito longa") // limite do bcrypt (72 bytes)
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), {
    message: "A senha deve conter letras e números",
  });

/** Telefone brasileiro: 10–11 dígitos (DDD + número), aceita formatação. */
const phoneSchema = z
  .string()
  .min(10, "Telefone obrigatório")
  .max(20)
  .refine((v) => v.replace(/\D/g, "").length >= 10, { message: "Telefone inválido" });

export const startNoKycRegistrationSchema = z
  .object({
    ownerName: z.string().min(1, "Nome obrigatório").max(200),
    /** Nome de exibição opcional da loja (confidencial — pode ficar em branco). */
    tradeName: z.string().max(200).optional().nullable(),
    email: z.string().email("E-mail inválido").max(200),
    phone: phoneSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "As senhas não coincidem",
    path: ["confirmPassword"],
  });
export type StartNoKycRegistrationInput = z.infer<typeof startNoKycRegistrationSchema>;

const codeField = z
  .string()
  .min(4)
  .max(8)
  .refine((v) => /^\d+$/.test(v.replace(/\D/g, "")), { message: "Código inválido" });

export const verifyNoKycEmailSchema = z.object({
  preRegistrationId: z.string().uuid(),
  code: codeField,
});
export type VerifyNoKycEmailInput = z.infer<typeof verifyNoKycEmailSchema>;

export const verifyNoKycPhoneSchema = z.object({
  preRegistrationId: z.string().uuid(),
  code: codeField,
});
export type VerifyNoKycPhoneInput = z.infer<typeof verifyNoKycPhoneSchema>;

export const resendNoKycCodeSchema = z.object({
  preRegistrationId: z.string().uuid(),
  channel: z.enum(["EMAIL", "WHATSAPP"]),
});
export type ResendNoKycCodeInput = z.infer<typeof resendNoKycCodeSchema>;
