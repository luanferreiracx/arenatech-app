import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { compareSync } from "bcryptjs";
import QRCode from "qrcode";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { prisma } from "@/server/db";
import { logger } from "@/lib/logger";
import {
  buildOtpAuthUrl,
  canDisableTwoFactor,
  consumeBackupCode,
  decryptSecret,
  diagnoseTotpFailure,
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
      const secret = decryptSecret(user.twoFactorSecret);
      if (!verifyTotp(secret, input.code)) {
        // Distingue as duas causas reais de "código não bate":
        const diag = diagnoseTotpFailure(secret, input.code);
        if (diag) {
          // O código casa com ESTE segredo, mas fora da janela → relógio fora.
          const seconds = Math.abs(diag.skewSteps) * 30;
          logger.warn("2FA confirm: código fora da janela de tempo (clock skew)", {
            userId: ctx.session.user.id,
            skewSteps: diag.skewSteps,
          });
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `O código está fora da janela de tempo (desvio de ~${seconds}s entre o servidor e seu app). Sincronize o horário do app autenticador e tente de novo.`,
          });
        }
        // Não casa nem em ±5min → o app está com uma entrada de outra configuração.
        logger.warn("2FA confirm: código não casa com o segredo atual (entrada antiga no app?)", {
          userId: ctx.session.user.id,
        });
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Código inválido. Se você já tinha tentado ativar o 2FA antes, remova a conta antiga do app autenticador e escaneie o QR novo desta tela.",
        });
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
  /**
   * Desativa o 2FA. Sempre exige a senha. Para a 2ª prova aceita:
   *  - código TOTP do app (quando o segredo é decifrável), OU
   *  - um backup code (independe do segredo — hashes próprios), OU
   *  - RECUPERAÇÃO: senha sozinha quando o segredo está INUTILIZÁVEL
   *    (null/indecifrável — ex.: cifrado com NEXTAUTH_SECRET antigo). Nesse caso
   *    o 2FA já está morto (o próprio dono não consegue gerar código), então a
   *    senha é o fator efetivo — destrava o "beco" sem enfraquecer um 2FA que
   *    FUNCIONA (com segredo válido, senha sozinha NÃO desativa).
   */
  disable: protectedProcedure
    .input(z.object({ password: z.string().min(1), code: z.string().trim().optional() }))
    .mutation(async ({ ctx, input }) => {
      const user = await prisma.user.findUnique({
        where: { id: ctx.session.user.id },
        select: { passwordHash: true, twoFactorSecret: true, twoFactorEnabled: true, twoFactorBackupCodes: true },
      });
      if (!user?.twoFactorEnabled) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "2FA não está ativo." });
      }
      if (!compareSync(input.password, user.passwordHash)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Senha incorreta." });
      }

      // O segredo é utilizável? (null ou indecifrável => 2FA morto => recuperação)
      let secretUsable = false;
      let totpSecret: string | null = null;
      if (user.twoFactorSecret) {
        try {
          totpSecret = decryptSecret(user.twoFactorSecret);
          secretUsable = true;
        } catch {
          secretUsable = false; // segredo corrompido/cifrado com chave antiga
        }
      }

      const code = input.code?.trim();
      const totpOk = secretUsable && !!totpSecret && !!code && verifyTotp(totpSecret, code);
      const backupOk = !!code && consumeBackupCode(code, user.twoFactorBackupCodes) !== null;

      if (!canDisableTwoFactor({ secretUsable, totpOk, backupOk })) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Código inválido. Use o código do app ou um backup code.",
        });
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
      logger.info("2FA: desativado", {
        userId: ctx.session.user.id,
        via: totpOk ? "totp" : backupOk ? "backup_code" : "recovery_secret_unusable",
      });
      return { success: true };
    }),
});
