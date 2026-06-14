/**
 * Router do onboarding NO-KYC (ADR 0050, Fase 3) — endpoints PÚBLICOS.
 *
 * Fluxo: start → verifyEmail → verifyPhone → (aguardando aprovação do
 * superadmin, Fase 4). Sem CPF/CNPJ; o usuário define a própria senha. O
 * `PreRegistration` guarda o hash da senha e os timestamps de verificação; o
 * usuário/tenant só são criados na aprovação.
 */
import { TRPCError } from "@trpc/server";
import { hashSync } from "bcryptjs";
import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import { rateLimitMiddleware } from "@/server/api/middleware/rate-limit";
import { prisma } from "@/server/db";
import { logger } from "@/lib/logger";
import {
  issueVerificationCode,
  verifyCode,
} from "@/server/services/verification.service";
import {
  startNoKycRegistrationSchema,
  verifyNoKycEmailSchema,
  verifyNoKycPhoneSchema,
  resendNoKycCodeSchema,
} from "@/lib/validators/no-kyc";

const BCRYPT_ROUNDS = 12;

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function normalizePhone(value: string): string {
  return value.replace(/\D/g, "");
}

/** Mensagem amigável p/ cada motivo de falha de verificação. */
const VERIFY_FAIL_MESSAGE: Record<string, string> = {
  not_found: "Código não encontrado. Solicite um novo código.",
  expired: "Código expirado. Solicite um novo código.",
  too_many_attempts: "Muitas tentativas. Solicite um novo código.",
  invalid: "Código incorreto.",
};

export const noKycRouter = createTRPCRouter({
  /**
   * Etapa 1: cria o pré-cadastro NO-KYC e dispara o código de verificação do
   * e-mail. Rejeita e-mail já cadastrado (usuário existente) — o índice único
   * parcial garante no banco, mas aqui devolvemos erro amigável antes.
   */
  startRegistration: publicProcedure
    .use(rateLimitMiddleware({ limit: 5, windowMs: 60 * 60 * 1000 }))
    .input(startNoKycRegistrationSchema)
    .mutation(async ({ input }) => {
      const email = normalizeEmail(input.email);
      const phone = normalizePhone(input.phone);

      // E-mail é a identidade do NO-KYC: não pode colidir com usuário existente.
      const existingUser = await prisma.user.findFirst({
        where: { email },
        select: { id: true },
      });
      if (existingUser) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Este e-mail já está cadastrado. Faça login ou use a recuperação de senha.",
        });
      }

      // Reaproveita um pré-cadastro pendente do mesmo e-mail (reenvio do fluxo)
      // em vez de acumular duplicatas; só se ainda não aprovado/rejeitado.
      const pending = await prisma.preRegistration.findFirst({
        where: { ownerEmail: email, status: "PENDING" },
        select: { id: true },
        orderBy: { createdAt: "desc" },
      });

      const passwordHash = hashSync(input.password, BCRYPT_ROUNDS);
      const data = {
        tradeName: input.tradeName?.trim() || "Loja NO-KYC",
        ownerName: input.ownerName,
        ownerEmail: email,
        ownerPhone: phone,
        passwordHash,
        emailVerifiedAt: null,
        phoneVerifiedAt: null,
      };

      const pr = pending
        ? await prisma.preRegistration.update({ where: { id: pending.id }, data })
        : await prisma.preRegistration.create({ data });

      await issueVerificationCode({ target: email, channel: "EMAIL", preRegistrationId: pr.id });
      logger.info("NO-KYC: pré-cadastro iniciado", { id: pr.id });

      return { preRegistrationId: pr.id, emailMasked: maskEmail(email) };
    }),

  /** Etapa 2: valida o código do e-mail e dispara o código do telefone. */
  verifyEmail: publicProcedure
    .use(rateLimitMiddleware({ limit: 10, windowMs: 60 * 60 * 1000 }))
    .input(verifyNoKycEmailSchema)
    .mutation(async ({ input }) => {
      const pr = await loadPending(input.preRegistrationId);

      const result = await verifyCode(pr.ownerEmail, "EMAIL", input.code);
      if (!result.ok) {
        throw new TRPCError({ code: "BAD_REQUEST", message: VERIFY_FAIL_MESSAGE[result.reason] });
      }

      await prisma.preRegistration.update({
        where: { id: pr.id },
        data: { emailVerifiedAt: new Date() },
      });
      // Encadeia a verificação do telefone.
      await issueVerificationCode({ target: pr.ownerPhone, channel: "WHATSAPP", preRegistrationId: pr.id });
      logger.info("NO-KYC: e-mail verificado", { id: pr.id });

      return { phoneMasked: maskPhone(pr.ownerPhone) };
    }),

  /** Etapa 3: valida o código do telefone → cadastro completo (aguardando aprovação). */
  verifyPhone: publicProcedure
    .use(rateLimitMiddleware({ limit: 10, windowMs: 60 * 60 * 1000 }))
    .input(verifyNoKycPhoneSchema)
    .mutation(async ({ input }) => {
      const pr = await loadPending(input.preRegistrationId);
      if (!pr.emailVerifiedAt) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Verifique o e-mail primeiro." });
      }

      const result = await verifyCode(pr.ownerPhone, "WHATSAPP", input.code);
      if (!result.ok) {
        throw new TRPCError({ code: "BAD_REQUEST", message: VERIFY_FAIL_MESSAGE[result.reason] });
      }

      await prisma.preRegistration.update({
        where: { id: pr.id },
        data: { phoneVerifiedAt: new Date() },
      });
      logger.info("NO-KYC: telefone verificado — aguardando aprovação", { id: pr.id });

      return { done: true };
    }),

  /** Reenvia o código do canal pedido para um pré-cadastro pendente. */
  resendCode: publicProcedure
    .use(rateLimitMiddleware({ limit: 5, windowMs: 15 * 60 * 1000 }))
    .input(resendNoKycCodeSchema)
    .mutation(async ({ input }) => {
      const pr = await loadPending(input.preRegistrationId);
      const target = input.channel === "EMAIL" ? pr.ownerEmail : pr.ownerPhone;
      await issueVerificationCode({ target, channel: input.channel, preRegistrationId: pr.id });
      return { sent: true };
    }),
});

/** Carrega um pré-cadastro PENDING ou lança NOT_FOUND/BAD_REQUEST. */
async function loadPending(id: string) {
  const pr = await prisma.preRegistration.findUnique({ where: { id } });
  if (!pr) throw new TRPCError({ code: "NOT_FOUND", message: "Pré-cadastro não encontrado." });
  if (pr.status !== "PENDING") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Pré-cadastro já processado." });
  }
  return pr;
}

function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  return `${(user ?? "").slice(0, 2)}***@${domain ?? ""}`;
}

function maskPhone(phone: string): string {
  return `***${phone.slice(-4)}`;
}
