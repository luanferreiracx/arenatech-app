import { z } from "zod";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "@/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { prisma, withTenant, withAdmin } from "@/server/db";
import { hashPassword, validatePasswordPolicy } from "@/lib/password";
import {
  enforcePasswordPolicy,
  resolveUserPasswordPolicy,
  DEFAULT_PASSWORD_POLICY,
} from "@/server/services/password-policy.service";
import { sendEmail } from "@/lib/services/email-service";
import { compareSync } from "bcryptjs";
import { logger } from "@/lib/logger";
import { rateLimitMiddleware } from "@/server/api/middleware/rate-limit";
import { escapeHtml } from "@/lib/utils/html";
import { hasTenantAccess } from "@/lib/auth/active-tenant";
import { generateResetToken, hashResetToken } from "@/lib/auth/reset-token";
import { getAppBaseUrl } from "@/lib/utils/app-url";

/**
 * Fluxo de reset de senha (gera+grava token, envia email). Isolado pra ser
 * disparado FIRE-AND-FORGET pelo forgotPassword — assim a resposta tem tempo
 * uniforme haja ou não usuário (senão o envio de email vira oráculo de timing
 * pra enumeração). Roda no servidor Node persistente (output standalone), então
 * a promise não-esperada conclui normalmente. Erros são tratados por quem chama.
 */
async function dispatchPasswordReset(user: { id: string; email: string; name: string }): Promise<void> {
  const token = generateResetToken();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hora

  // Invalida tokens anteriores ainda válidos deste usuário.
  await prisma.passwordResetToken.updateMany({
    where: { userId: user.id, usedAt: null },
    data: { usedAt: new Date() },
  });

  // Guarda só o HASH — o token em claro vai pro usuário via email.
  await prisma.passwordResetToken.create({
    data: { userId: user.id, token: hashResetToken(token), expiresAt },
  });

  const resetLink = `${getAppBaseUrl()}/reset-password?token=${token}`;
  // Escapa o nome (anti HTML-injection). Link é server-side (token + baseUrl env).
  const safeName = escapeHtml(user.name);
  await sendEmail(
    user.email,
    "Arena Tech - Redefinir senha",
    `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
          <h2 style="color: #2ec4b6;">Arena Tech</h2>
          <p>Ola, ${safeName}!</p>
          <p>Voce solicitou a redefinicao da sua senha. Clique no botao abaixo para criar uma nova senha:</p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${resetLink}"
               style="background-color: #2ec4b6; color: #0a0a0a; padding: 12px 32px; border-radius: 6px; text-decoration: none; font-weight: bold; display: inline-block;">
              Redefinir Senha
            </a>
          </div>
          <p style="font-size: 13px; color: #666;">Este link expira em 1 hora. Se voce nao solicitou a redefinicao, ignore este e-mail.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
          <p style="font-size: 12px; color: #999;">Arena Tech - Sistema de Gestao</p>
        </div>
        `,
  );
  logger.info("forgotPassword: reset email sent", { userId: user.id });
}

export const authRouter = createTRPCRouter({
  /** Return current session info */
  me: protectedProcedure.query(({ ctx }) => {
    return {
      user: ctx.session.user,
      activeTenantId: ctx.session.activeTenantId,
      availableTenants: ctx.session.availableTenants,
    };
  }),

  /** Validate that user has access to the given tenant. */
  validateTenantAccess: protectedProcedure
    .input(z.object({ tenantId: z.string().uuid() }))
    .mutation(({ ctx, input }) => {
      if (!hasTenantAccess(ctx.session, input.tenantId)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Access denied to this tenant",
        });
      }
      return { success: true, tenantId: input.tenantId };
    }),

  /** Request password reset — sends email with reset link */
  forgotPassword: publicProcedure
    // Rate limit: 3 pedidos de reset por IP a cada 15min.
    .use(rateLimitMiddleware({ limit: 3, windowMs: 15 * 60 * 1000 }))
    .input(z.object({ identifier: z.string().min(1, "Informe o CPF ou e-mail") }))
    .mutation(async ({ input }) => {
      // Normalize: remove formatting from CPF
      const normalized = input.identifier.replace(/\D/g, "");
      const isCpf = /^\d{11}$/.test(normalized);

      // Find user by CPF or email
      const user = await prisma.user.findFirst({
        where: isCpf
          ? { cpf: normalized }
          : { email: { equals: input.identifier, mode: "insensitive" } },
        select: { id: true, email: true, name: true },
      });

      // Enumeração por TIMING: a resposta já é sempre `success`, mas o caminho
      // com usuário existente faz trabalho extra (gera/grava token + ENVIA email,
      // que é lento) antes de retornar — um atacante medindo o tempo distinguia
      // "existe" (lento) de "não existe" (rápido). Fix: dispara o fluxo de reset
      // SEM esperar (fire-and-forget) e retorna no MESMO tempo nos dois casos.
      // Erros do envio são só logados (nunca revelados — mesma UX de antes).
      if (user?.email) {
        void dispatchPasswordReset({ id: user.id, email: user.email, name: user.name }).catch(
          (err) =>
            logger.error("forgotPassword: falha no fluxo de reset (async)", {
              userId: user.id,
              err: err instanceof Error ? err.message : String(err),
            }),
        );
      } else {
        logger.info("forgotPassword: user not found or no email", {
          identifier: isCpf ? "***CPF***" : input.identifier,
        });
      }

      // Sempre sucesso, sempre no mesmo tempo (não espera o envio).
      return { success: true };
    }),

  /** Reset password using token */
  resetPassword: publicProcedure
    .input(
      z.object({
        token: z.string().uuid(),
        newPassword: z.string().min(6, "A senha deve ter pelo menos 6 caracteres"),
      }),
    )
    .mutation(async ({ input }) => {
      const tokenHash = hashResetToken(input.token);
      const resetToken = await prisma.passwordResetToken.findUnique({
        where: { token: tokenHash },
        include: { user: { select: { id: true } } },
      });

      if (!resetToken) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Token invalido ou expirado",
        });
      }

      if (resetToken.usedAt) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Este link ja foi utilizado",
        });
      }

      if (resetToken.expiresAt < new Date()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Este link expirou. Solicite um novo.",
        });
      }

      // D4: o reset por email deve respeitar a política de senha (antes só exigia
      // 6 chars, furando a política que o changePassword aplica). Como a senha é
      // global, exige a política mais estrita entre os tenants do usuário.
      const policy = await withAdmin((tx) =>
        resolveUserPasswordPolicy(tx as never, resetToken.userId),
      );
      const policyError = validatePasswordPolicy(input.newPassword, policy);
      if (policyError) {
        throw new TRPCError({ code: "BAD_REQUEST", message: policyError });
      }

      const passwordHash = hashPassword(input.newPassword);

      // Update password and mark token as used
      await prisma.$transaction([
        prisma.user.update({
          where: { id: resetToken.userId },
          data: { passwordHash, mustChangePassword: false },
        }),
        prisma.passwordResetToken.update({
          where: { id: resetToken.id },
          data: { usedAt: new Date() },
        }),
      ]);

      logger.info("resetPassword: password updated", { userId: resetToken.userId });
      return { success: true };
    }),

  /** Change password (authenticated user) */
  changePassword: protectedProcedure
    .input(
      z.object({
        currentPassword: z.string().min(1, "Informe a senha atual"),
        // Tamanho/complexidade ficam na POLITICA do tenant (D4) — aqui so nao-vazio.
        newPassword: z.string().min(1, "Informe a nova senha"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const user = await prisma.user.findUnique({
        where: { id: ctx.session.user.id },
        select: { id: true, passwordHash: true },
      });

      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Usuario nao encontrado" });
      }

      const isValid = compareSync(input.currentPassword, user.passwordHash);
      if (!isValid) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Senha atual incorreta",
        });
      }

      // Aplica a politica de senha do tenant ativo (D4). Sem tenant ativo
      // (multi-tenant sem selecao), valida com a politica padrao.
      if (ctx.session.activeTenantId) {
        const activeTenantId = ctx.session.activeTenantId;
        await withTenant(activeTenantId, (tx) =>
          enforcePasswordPolicy(tx as never, activeTenantId, input.newPassword),
        );
      } else {
        const err = validatePasswordPolicy(input.newPassword, DEFAULT_PASSWORD_POLICY);
        if (err) throw new TRPCError({ code: "BAD_REQUEST", message: err });
      }

      const passwordHash = hashPassword(input.newPassword);
      await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash, mustChangePassword: false },
      });

      logger.info("changePassword: password updated", { userId: user.id });
      return { success: true };
    }),
});
