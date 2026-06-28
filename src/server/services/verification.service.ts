/**
 * Serviço de verificação por código (OTP) do onboarding NO-KYC (ADR 0050).
 *
 * Orquestra o ciclo de vida do código:
 *   - issue: gera, persiste o HASH (invalidando os anteriores do mesmo alvo) e
 *     envia por email (Resend) ou WhatsApp (Cloud API, template AUTHENTICATION).
 *   - verify: valida o código informado (expiração, tentativas, consumo) em
 *     tempo constante e marca como consumido no sucesso.
 *
 * A tabela `verification_codes` é GLOBAL (sem RLS) — o usuário/tenant ainda não
 * existe durante o cadastro. Funções puras (geração/hash) em
 * `src/lib/auth/verification-code.ts`.
 */
import type { VerificationChannel } from "@prisma/client";
import { prisma } from "@/server/db";
import { logger } from "@/lib/logger";
import { sendEmail } from "@/lib/services/email-service";
import { sendCloudTemplate } from "@/lib/services/whatsapp-cloud-service";
import { APPROVED_TEMPLATES } from "@/lib/whatsapp/templates-catalog";
import {
  expiresAtFromNow,
  generateVerificationCode,
  hashVerificationCode,
  normalizeCode,
  verifyCodeHash,
  VERIFICATION_MAX_ATTEMPTS,
  VERIFICATION_CODE_TTL_MINUTES,
} from "@/lib/auth/verification-code";

const WHATSAPP_OTP_TEMPLATE = "nokyc_verificacao";

export type IssueVerificationInput = {
  /** Email ou telefone a verificar. */
  target: string;
  channel: VerificationChannel;
  /** Pré-cadastro associado (o fluxo NO-KYC verifica antes de criar o usuário). */
  preRegistrationId?: string;
};

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "expired" | "too_many_attempts" | "invalid" };

/**
 * Gera e envia um código para o alvo. Invalida códigos pendentes anteriores do
 * mesmo (target, channel) — só o último vale. Retorna sucesso do ENVIO; o
 * código nunca é retornado ao chamador.
 */
export async function issueVerificationCode(input: IssueVerificationInput): Promise<{ sent: boolean }> {
  const { target, channel, preRegistrationId } = input;
  const code = generateVerificationCode();
  const codeHash = hashVerificationCode(code);
  const expiresAt = expiresAtFromNow(VERIFICATION_CODE_TTL_MINUTES);

  // Invalida pendentes anteriores (consome) e cria o novo, atomicamente.
  await prisma.$transaction([
    prisma.verificationCode.updateMany({
      where: { target, channel, consumedAt: null },
      data: { consumedAt: new Date() },
    }),
    prisma.verificationCode.create({
      data: { target, channel, preRegistrationId, codeHash, expiresAt },
    }),
  ]);

  const sent = channel === "EMAIL" ? await sendByEmail(target, code) : await sendByWhatsApp(target, code);
  if (!sent) {
    logger.error("Verification: falha ao enviar código", { channel, target: maskTarget(target) });
  }
  return { sent };
}

export type VerifyCodeOptions = {
  /**
   * Consumir o código (marcar `consumedAt`) quando ele casar. Default `true`.
   *
   * Use `false` quando a operação exige DOIS códigos válidos (ex.: recovery de
   * 2FA = email + WhatsApp): valida-se ambos SEM consumir e, só se os dois
   * passarem, consome-se os dois (`consumeCode`). Assim, um código correto não é
   * queimado porque o OUTRO canal falhou (o usuário teria de re-pedir os dois).
   * A proteção anti-brute-force é mantida: o contador de tentativas ainda é
   * incrementado no mismatch, independente de `consume`.
   */
  consume?: boolean;
};

/**
 * Valida o código informado para o alvo. Por padrão consome no sucesso;
 * incrementa tentativas e invalida ao estourar o limite. Com `consume:false`,
 * valida sem consumir (ver `VerifyCodeOptions`).
 */
export async function verifyCode(
  target: string,
  channel: VerificationChannel,
  inputCode: string,
  options: VerifyCodeOptions = {},
): Promise<VerifyResult> {
  const consume = options.consume ?? true;
  const record = await prisma.verificationCode.findFirst({
    where: { target, channel, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });

  if (!record) return { ok: false, reason: "not_found" };

  if (record.expiresAt.getTime() < Date.now()) {
    await prisma.verificationCode.update({ where: { id: record.id }, data: { consumedAt: new Date() } });
    return { ok: false, reason: "expired" };
  }

  if (record.attempts >= VERIFICATION_MAX_ATTEMPTS) {
    await prisma.verificationCode.update({ where: { id: record.id }, data: { consumedAt: new Date() } });
    return { ok: false, reason: "too_many_attempts" };
  }

  if (!verifyCodeHash(normalizeCode(inputCode), record.codeHash)) {
    await prisma.verificationCode.update({
      where: { id: record.id },
      data: { attempts: { increment: 1 } },
    });
    return { ok: false, reason: "invalid" };
  }

  if (consume) {
    await prisma.verificationCode.update({ where: { id: record.id }, data: { consumedAt: new Date() } });
  }
  return { ok: true };
}

/**
 * Consome (marca `consumedAt`) o código pendente mais recente do alvo/canal.
 * Idempotente — usado após validar múltiplos códigos com `verifyCode(...,
 * { consume: false })` para queimar todos de uma vez no sucesso total.
 */
export async function consumeCode(target: string, channel: VerificationChannel): Promise<void> {
  await prisma.verificationCode.updateMany({
    where: { target, channel, consumedAt: null },
    data: { consumedAt: new Date() },
  });
}

/**
 * Remetente do e-mail de verificação NO-KYC. O onboarding NO-KYC vive em
 * pdvdepix.app, então o código sai dessa marca (não do EMAIL_FROM global
 * Arena Tech). Configurável via NOKYC_EMAIL_FROM. O domínio precisa estar
 * verificado no Resend. Ver ADR 0050.
 */
const NOKYC_EMAIL_FROM = process.env.NOKYC_EMAIL_FROM ?? "noreply@pdvdepix.app";

async function sendByEmail(to: string, code: string): Promise<boolean> {
  const subject = "Seu código de verificação";
  const html = `
    <p>Seu código de verificação é:</p>
    <p style="font-size:28px;font-weight:700;letter-spacing:4px;">${code}</p>
    <p>Ele expira em ${VERIFICATION_CODE_TTL_MINUTES} minutos. Por segurança, não compartilhe este código.</p>
  `;
  const result = await sendEmail(to, subject, html, NOKYC_EMAIL_FROM);
  return result.success;
}

async function sendByWhatsApp(to: string, code: string): Promise<boolean> {
  const template = APPROVED_TEMPLATES[WHATSAPP_OTP_TEMPLATE];
  if (!template) {
    logger.error("Verification: template OTP WhatsApp ausente do catálogo", { template: WHATSAPP_OTP_TEMPLATE });
    return false;
  }
  // Template AUTHENTICATION/OTP: o código vai no body ({{1}}) E no botão
  // COPY_CODE (sub_type url, index 0) — exigência da Meta para templates OTP.
  const components = [
    { type: "body", parameters: [{ type: "text", text: code }] },
    { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: code }] },
  ];
  const result = await sendCloudTemplate(to, template.name, template.language, components);
  return result.success;
}

/** Mascara o alvo para logs (não vaza email/telefone completo). */
function maskTarget(target: string): string {
  if (target.includes("@")) {
    const [user, domain] = target.split("@");
    return `${(user ?? "").slice(0, 2)}***@${domain ?? ""}`;
  }
  return `***${target.slice(-4)}`;
}
