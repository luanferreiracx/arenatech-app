/**
 * Allowlist de carteiras BYOW (self-custody) do DePix — router do PAINEL.
 *
 * Cadastrar um endereço define PARA ONDE o dinheiro pode ir, então é uma
 * operação de custódia de alto risco. Fluxo em 2 passos (mesmo padrão do
 * recovery de 2FA, `two-factor.confirmRecovery`):
 *   1. `startAdd` — senha + step-up 2FA → dispara código no EMAIL e no WhatsApp.
 *   2. `confirmAdd` — os DOIS códigos → grava na allowlist.
 * Remover exige só step-up 2FA (reduz destinos = seguro).
 *
 * A API de parceiro NUNCA chama estas mutations — só o painel (tenantAdmin).
 */
import { TRPCError } from "@trpc/server";
import { compareSync } from "bcryptjs";
import { createTRPCRouter, tenantAdminProcedure } from "@/server/api/trpc";
import { prisma } from "@/server/db";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import { verifyUserTwoFactor } from "@/lib/auth/two-factor-verify";
import {
  consumeCode,
  issueVerificationCode,
  verifyCode,
} from "@/server/services/verification.service";
import {
  listByowWallets,
  addByowWallet,
  removeByowWallet,
} from "@/server/services/depix-byow.service";
import {
  startAddByowWalletSchema,
  confirmAddByowWalletSchema,
  removeByowWalletSchema,
} from "@/lib/validators/depix-byow";

/** Mascara email pra exibir na UI (a***@dominio.com). */
function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "***";
  return `${local.slice(0, 1)}${"*".repeat(Math.max(1, local.length - 1))}@${domain}`;
}

/** Mascara telefone (mantém os 2 últimos dígitos). */
function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 2) return "***";
  return `${"*".repeat(Math.max(2, digits.length - 2))}${digits.slice(-2)}`;
}

/** Confirma senha + step-up 2FA; retorna email/phone do usuário pra o fluxo. */
async function assertPasswordAndTwoFactor(
  userId: string,
  password: string,
  twoFactorCode: string,
): Promise<{ email: string; phone: string }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true, email: true, phone: true },
  });
  if (!user) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Usuário não encontrado." });
  }
  if (!compareSync(password, user.passwordHash)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Senha incorreta." });
  }
  if (!user.email || !user.phone) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Cadastrar carteira exige email E WhatsApp no seu usuário (confirmação por ambos).",
    });
  }
  const stepUp = await verifyUserTwoFactor(userId, twoFactorCode);
  if (!stepUp.ok) {
    if (stepUp.reason === "not_enrolled") {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Habilite o 2FA em Configurações → Segurança antes de cadastrar carteiras.",
      });
    }
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Código 2FA inválido." });
  }
  return { email: user.email, phone: user.phone };
}

export const depixByowRouter = createTRPCRouter({
  /** Lista as carteiras BYOW ativas do tenant. */
  list: tenantAdminProcedure.query(async ({ ctx }) => {
    return listByowWallets(ctx.tenantId);
  }),

  /**
   * Passo 1 do cadastro: senha + 2FA → dispara os códigos de email e WhatsApp.
   * Ainda NÃO grava a carteira.
   */
  startAdd: tenantAdminProcedure
    .input(startAddByowWalletSchema)
    .mutation(async ({ ctx, input }) => {
      const rl = await rateLimit({
        key: `byow-add-start:${ctx.session.user.id}`,
        limit: 5,
        windowMs: 60 * 60 * 1000,
      });
      if (!rl.success) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Muitas tentativas. Tente mais tarde." });
      }
      const { email, phone } = await assertPasswordAndTwoFactor(
        ctx.session.user.id,
        input.password,
        input.twoFactorCode,
      );
      await issueVerificationCode({ target: email, channel: "EMAIL" });
      await issueVerificationCode({ target: phone, channel: "WHATSAPP" });
      logger.info("byow: códigos de confirmação enviados (email + whatsapp)", {
        tenantId: ctx.tenantId,
        userId: ctx.session.user.id,
      });
      return { sent: true, emailMasked: maskEmail(email), phoneMasked: maskPhone(phone) };
    }),

  /**
   * Passo 2 do cadastro: os DOIS códigos precisam bater. Só então grava. Valida
   * ambos SEM consumir e consome os dois juntos no sucesso (padrão confirmRecovery
   * — um código correto não é queimado se o outro canal falhar).
   */
  confirmAdd: tenantAdminProcedure
    .input(confirmAddByowWalletSchema)
    .mutation(async ({ ctx, input }) => {
      const rl = await rateLimit({
        key: `byow-add-confirm:${ctx.session.user.id}`,
        limit: 10,
        windowMs: 60 * 60 * 1000,
      });
      if (!rl.success) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Muitas tentativas. Tente mais tarde." });
      }
      const user = await prisma.user.findUnique({
        where: { id: ctx.session.user.id },
        select: { email: true, phone: true },
      });
      if (!user?.email || !user?.phone) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Cadastrar carteira exige email E WhatsApp no seu usuário.",
        });
      }
      const emailRes = await verifyCode(user.email, "EMAIL", input.emailCode, { consume: false });
      const waRes = await verifyCode(user.phone, "WHATSAPP", input.whatsappCode, { consume: false });
      if (!emailRes.ok || !waRes.ok) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Código do email ou do WhatsApp inválido/expirado. Reenvie e tente novamente.",
        });
      }
      await consumeCode(user.email, "EMAIL");
      await consumeCode(user.phone, "WHATSAPP");

      return addByowWallet({
        tenantId: ctx.tenantId,
        createdByUserId: ctx.session.user.id,
        address: input.address,
        label: input.label,
        isThirdParty: input.isThirdParty,
      });
    }),

  /** Remove (desativa) uma carteira — exige só step-up 2FA (operação segura). */
  remove: tenantAdminProcedure
    .input(removeByowWalletSchema)
    .mutation(async ({ ctx, input }) => {
      const stepUp = await verifyUserTwoFactor(ctx.session.user.id, input.twoFactorCode);
      if (!stepUp.ok) {
        if (stepUp.reason === "not_enrolled") {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Habilite o 2FA em Configurações → Segurança.",
          });
        }
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Código 2FA inválido." });
      }
      await removeByowWallet(ctx.tenantId, input.id);
      return { removed: true };
    }),
});
