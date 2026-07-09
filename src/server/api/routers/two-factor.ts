import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { compareSync } from "bcryptjs";
import QRCode from "qrcode";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { prisma } from "@/server/db";
import { logger } from "@/lib/logger";
import {
  buildOtpAuthUrl,
  consumeBackupCode,
  decryptSecret,
  diagnoseTotpFailure,
  encryptSecret,
  generateBackupCodes,
  generateTotpSecret,
  isTwoFactorConfigured,
  verifyTotp,
} from "@/lib/auth/two-factor";
import { consumeCode, issueVerificationCode, verifyCode } from "@/server/services/verification.service";
import { verifyUserTwoFactor } from "@/lib/auth/two-factor-verify";
import { rateLimit } from "@/lib/rate-limit";

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
  startEnrollment: protectedProcedure
    .input(z.object({ code: z.string().trim().optional() }).optional())
    .mutation(async ({ ctx, input }) => {
    if (!isTwoFactorConfigured()) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "2FA não está disponível neste ambiente." });
    }

    // Se o 2FA JÁ está ativo, re-enrolar EXIGE um código atual válido (TOTP ou
    // backup). Sem isto, uma sessão sequestrada trocaria o 2FA para o dispositivo
    // do atacante SEM conhecer o fator atual, derrotando o step-up que protege
    // ações sensíveis (ex.: saque DePix irreversível). A UI só chama startEnrollment
    // quando o 2FA está desativado; este gate fecha o caminho via API direta (A1).
    const current = await prisma.user.findUnique({
      where: { id: ctx.session.user.id },
      select: { twoFactorEnabled: true },
    });
    if (current?.twoFactorEnabled) {
      const stepUp = await verifyUserTwoFactor(ctx.session.user.id, input?.code ?? "");
      if (!stepUp.ok) {
        logger.warn("2FA: re-enrollment bloqueado — código atual ausente/inválido", {
          userId: ctx.session.user.id,
          reason: stepUp.reason,
        });
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message:
            "Informe um código 2FA válido (do app ou um backup code) para reconfigurar a verificação em duas etapas.",
        });
      }
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

  /**
   * DESATIVAR 2FA — passo 1 (caminho forte): valida senha + código TOTP do app e,
   * se baterem, dispara um código no EMAIL e outro no WHATSAPP. Exige os dois
   * canais cadastrados. Quem não tem o app usa `disableWithBackupCode`.
   *
   * Só emite os códigos DEPOIS de provar senha + TOTP — não dá pra spammar
   * email/WhatsApp de terceiros sem já ter a senha e o app.
   */
  startDisable: protectedProcedure
    .input(z.object({ password: z.string().min(1), totpCode: totpCodeSchema }))
    .mutation(async ({ ctx, input }) => {
      const rl = await rateLimit({
        key: `2fa-disable-start:${ctx.session.user.id}`,
        limit: 5,
        windowMs: 60 * 60 * 1000,
      });
      if (!rl.success) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Muitas tentativas. Tente mais tarde." });
      }
      const user = await prisma.user.findUnique({
        where: { id: ctx.session.user.id },
        select: { passwordHash: true, twoFactorSecret: true, twoFactorEnabled: true, email: true, phone: true },
      });
      if (!user?.twoFactorEnabled || !user.twoFactorSecret) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "2FA não está ativo." });
      }
      if (!compareSync(input.password, user.passwordHash)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Senha incorreta." });
      }
      if (!verifyTotp(decryptSecret(user.twoFactorSecret), input.totpCode)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Código do app inválido." });
      }
      if (!user.email || !user.phone) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Desativar exige email E WhatsApp cadastrados. Sem ambos, use um backup code ou peça ao suporte para redefinir seu 2FA.",
        });
      }

      await issueVerificationCode({ target: user.email, channel: "EMAIL" });
      await issueVerificationCode({ target: user.phone, channel: "WHATSAPP" });
      logger.info("2FA disable: códigos enviados (email + whatsapp)", { userId: ctx.session.user.id });
      return { sent: true, emailMasked: maskEmail(user.email), phoneMasked: maskPhone(user.phone) };
    }),

  /**
   * DESATIVAR 2FA — passo 2 (caminho forte): senha + TOTP + código do EMAIL +
   * código do WHATSAPP. Os quatro fatores precisam bater. Só então zera o 2FA.
   */
  confirmDisable: protectedProcedure
    .input(
      z.object({
        password: z.string().min(1),
        totpCode: totpCodeSchema,
        emailCode: z.string().trim().min(1),
        whatsappCode: z.string().trim().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const rl = await rateLimit({
        key: `2fa-disable-confirm:${ctx.session.user.id}`,
        limit: 10,
        windowMs: 60 * 60 * 1000,
      });
      if (!rl.success) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Muitas tentativas. Tente mais tarde." });
      }
      const user = await prisma.user.findUnique({
        where: { id: ctx.session.user.id },
        select: { passwordHash: true, twoFactorSecret: true, twoFactorEnabled: true, email: true, phone: true },
      });
      if (!user?.twoFactorEnabled || !user.twoFactorSecret) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "2FA não está ativo." });
      }
      if (!compareSync(input.password, user.passwordHash)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Senha incorreta." });
      }
      if (!verifyTotp(decryptSecret(user.twoFactorSecret), input.totpCode)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Código do app inválido." });
      }
      if (!user.email || !user.phone) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Desativar exige email E WhatsApp cadastrados.",
        });
      }

      // Valida AMBOS os códigos SEM consumir — só queima os dois se os dois
      // passarem (senão um código válido seria invalidado porque o outro canal
      // falhou). O contador de tentativas ainda incrementa no mismatch.
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

      await prisma.user.update({
        where: { id: ctx.session.user.id },
        data: {
          twoFactorEnabled: false,
          twoFactorSecret: null,
          twoFactorConfirmedAt: null,
          twoFactorBackupCodes: [],
        },
      });
      logger.info("2FA: desativado (senha + totp + email + whatsapp)", { userId: ctx.session.user.id });
      return { success: true };
    }),

  /**
   * DESATIVAR 2FA — caminho alternativo (perdeu o app): senha + um backup code
   * válido. É a única saída sem o app; sem app E sem backup code, só o superadmin
   * redefine (resetTenantUserTwoFactor).
   */
  disableWithBackupCode: protectedProcedure
    .input(z.object({ password: z.string().min(1), backupCode: z.string().trim().min(1, "Informe o backup code") }))
    .mutation(async ({ ctx, input }) => {
      const rl = await rateLimit({
        key: `2fa-disable-backup:${ctx.session.user.id}`,
        limit: 10,
        windowMs: 60 * 60 * 1000,
      });
      if (!rl.success) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Muitas tentativas. Tente mais tarde." });
      }
      const user = await prisma.user.findUnique({
        where: { id: ctx.session.user.id },
        select: { passwordHash: true, twoFactorEnabled: true, twoFactorBackupCodes: true },
      });
      if (!user?.twoFactorEnabled) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "2FA não está ativo." });
      }
      if (!compareSync(input.password, user.passwordHash)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Senha incorreta." });
      }
      if (consumeBackupCode(input.backupCode.trim(), user.twoFactorBackupCodes) === null) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Backup code inválido." });
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
      logger.info("2FA: desativado (senha + backup code)", { userId: ctx.session.user.id });
      return { success: true };
    }),
});

/** Mascara um email pra exibir na UI (a***@dominio.com). */
function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "***";
  const head = local.slice(0, 1);
  return `${head}${"*".repeat(Math.max(1, local.length - 1))}@${domain}`;
}

/** Mascara um telefone (mantém os 2 últimos dígitos). */
function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 2) return "***";
  return `${"*".repeat(Math.max(2, digits.length - 2))}${digits.slice(-2)}`;
}
