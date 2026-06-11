import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { compareSync } from "bcryptjs";
import QRCode from "qrcode";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { prisma } from "@/server/db";
import { logger } from "@/lib/logger";
import {
  buildOtpAuthUrl,
  decryptSecret,
  encryptSecret,
  generateBackupCodes,
  generateTotpSecret,
  isTwoFactorConfigured,
  verifyTotp,
} from "@/lib/auth/two-factor";

const totpCodeSchema = z
  .string()
  .transform((v) => v.replace(/\s/g, ""))
  .pipe(z.string().regex(/^\d{6}$/, "Código deve ter 6 dígitos"));

export const twoFactorRouter = createTRPCRouter({
  /** Estado do 2FA do usuário atual. */
  getStatus: protectedProcedure.query(async ({ ctx }) => {
    const user = await prisma.user.findUnique({
      where: { id: ctx.session.user.id },
      select: { twoFactorEnabled: true, twoFactorConfirmedAt: true, twoFactorBackupCodes: true },
    });
    return {
      configured: isTwoFactorConfigured(),
      enabled: user?.twoFactorEnabled === true,
      confirmedAt: user?.twoFactorConfirmedAt ?? null,
      remainingBackupCodes: user?.twoFactorBackupCodes.length ?? 0,
    };
  }),

  /**
   * Inicia o enrollment: gera um segredo (cifrado, ainda NÃO habilitado) e
   * devolve a URI otpauth + QR. O 2FA só é ativado após confirm().
   */
  startEnrollment: protectedProcedure.mutation(async ({ ctx }) => {
    if (!isTwoFactorConfigured()) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "2FA não está disponível neste ambiente." });
    }

    const secret = generateTotpSecret();
    await prisma.user.update({
      where: { id: ctx.session.user.id },
      // Guarda o segredo (cifrado) mas mantém enabled=false até a confirmação.
      data: { twoFactorSecret: encryptSecret(secret), twoFactorEnabled: false, twoFactorConfirmedAt: null },
    });

    const label = ctx.session.user.cpf ?? ctx.session.user.id;
    const otpauthUrl = buildOtpAuthUrl(secret, label);
    const qrDataUrl = await QRCode.toDataURL(otpauthUrl, { margin: 1, width: 240 });

    logger.info("2FA: enrollment iniciado", { userId: ctx.session.user.id });
    return { otpauthUrl, qrDataUrl, secret };
  }),

  /**
   * Confirma o enrollment com um código do app. Ativa o 2FA e devolve os backup
   * codes UMA única vez (só os hashes ficam no banco).
   */
  confirm: protectedProcedure
    .input(z.object({ code: totpCodeSchema }))
    .mutation(async ({ ctx, input }) => {
      const user = await prisma.user.findUnique({
        where: { id: ctx.session.user.id },
        select: { twoFactorSecret: true, twoFactorEnabled: true },
      });
      if (!user?.twoFactorSecret) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Inicie a configuração do 2FA primeiro." });
      }
      if (!verifyTotp(decryptSecret(user.twoFactorSecret), input.code)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Código inválido. Tente novamente." });
      }

      const { codes, hashes } = generateBackupCodes();
      await prisma.user.update({
        where: { id: ctx.session.user.id },
        data: {
          twoFactorEnabled: true,
          twoFactorConfirmedAt: new Date(),
          twoFactorBackupCodes: hashes,
        },
      });

      logger.info("2FA: ativado", { userId: ctx.session.user.id });
      return { backupCodes: codes };
    }),

  /** Gera novos backup codes (exige um código válido do app). */
  regenerateBackupCodes: protectedProcedure
    .input(z.object({ code: totpCodeSchema }))
    .mutation(async ({ ctx, input }) => {
      const user = await prisma.user.findUnique({
        where: { id: ctx.session.user.id },
        select: { twoFactorSecret: true, twoFactorEnabled: true },
      });
      if (!user?.twoFactorEnabled || !user.twoFactorSecret) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "2FA não está ativo." });
      }
      if (!verifyTotp(decryptSecret(user.twoFactorSecret), input.code)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Código inválido." });
      }
      const { codes, hashes } = generateBackupCodes();
      await prisma.user.update({
        where: { id: ctx.session.user.id },
        data: { twoFactorBackupCodes: hashes },
      });
      return { backupCodes: codes };
    }),

  /** Desativa o 2FA. Exige senha atual + um código válido (app). */
  disable: protectedProcedure
    .input(z.object({ password: z.string().min(1), code: totpCodeSchema }))
    .mutation(async ({ ctx, input }) => {
      const user = await prisma.user.findUnique({
        where: { id: ctx.session.user.id },
        select: { passwordHash: true, twoFactorSecret: true, twoFactorEnabled: true },
      });
      if (!user?.twoFactorEnabled || !user.twoFactorSecret) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "2FA não está ativo." });
      }
      if (!compareSync(input.password, user.passwordHash)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Senha incorreta." });
      }
      if (!verifyTotp(decryptSecret(user.twoFactorSecret), input.code)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Código inválido." });
      }
      await prisma.user.update({
        where: { id: ctx.session.user.id },
        data: {
          twoFactorEnabled: false,
          twoFactorSecret: null,
          twoFactorConfirmedAt: null,
          twoFactorBackupCodes: [],
        },
      });
      logger.info("2FA: desativado", { userId: ctx.session.user.id });
      return { success: true };
    }),
});
