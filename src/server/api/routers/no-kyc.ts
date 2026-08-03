/**
 * Router do onboarding NO-KYC (ADR 0050, Fase 3) — endpoints PÚBLICOS.
 *
 * Fluxo: start → verifyEmail → verifyPhone → (aguardando aprovação do
 * superadmin, Fase 4). Sem CPF/CNPJ; o usuário define a própria senha. O
 * `PreRegistration` guarda o hash da senha e os timestamps de verificação; o
 * usuário/tenant só são criados na aprovação.
 */
import { TRPCError } from "@trpc/server";
import { Prisma } from "@prisma/client";
import { hashSync } from "bcryptjs";
import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import { rateLimitMiddleware } from "@/server/api/middleware/rate-limit";
import { prisma } from "@/server/db";
import { logger } from "@/lib/logger";
import {
  issueVerificationCode,
  verifyCode,
  type IssueVerificationInput,
} from "@/server/services/verification.service";
import { CATALOG_SLUGS } from "@/lib/plans/catalog";
import { notifyNewPreRegistration } from "@/server/services/onboarding-notify.service";
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

/** Dados do pré-cadastro escritos a cada tentativa (senha inclusive). */
type PendingRegistrationData = {
  tradeName: string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
  passwordHash: string;
  planId: string | null;
  emailVerifiedAt: null;
  phoneVerifiedAt: null;
};

/**
 * Resolve o SLUG de plano vindo da página de preços para um id do banco.
 *
 * Três filtros, nesta ordem: precisa estar no CATÁLOGO comercial (plano legado
 * como `free`/`pro` não se contrata por aqui), precisa EXISTIR no banco e
 * precisa estar ATIVO. Qualquer falha devolve `null` em vez de erro: o cadastro
 * é a última coisa que se deve derrubar por causa de um parâmetro de URL torto.
 * Sem plano, o superadmin escolhe na aprovação.
 */
async function resolvePlanIdBySlug(slug: string | null | undefined): Promise<string | null> {
  if (!slug) return null;
  if (!CATALOG_SLUGS.includes(slug)) {
    logger.warn("NO-KYC: slug de plano fora do catálogo ignorado", { slug });
    return null;
  }

  const plan = await prisma.plan.findUnique({
    where: { slug },
    select: { id: true, status: true },
  });
  if (!plan || plan.status !== "ACTIVE") {
    logger.warn("NO-KYC: plano do catálogo ausente ou inativo no banco", { slug });
    return null;
  }
  return plan.id;
}

/**
 * Reaproveita o pré-cadastro PENDENTE do mesmo e-mail em vez de acumular
 * duplicatas — refazer o cadastro é o caminho normal de quem não recebeu o
 * código, e a pessoa pode até escolher outra senha.
 *
 * Entre o SELECT e o INSERT existe janela de corrida; quem fecha é o índice
 * único parcial (migration 20260729130000). Ao perder a corrida, o P2002 traz
 * de volta pro caminho de reuso: dois cliques simultâneos viram um cadastro só,
 * não um 500 na cara de quem só clicou duas vezes.
 */
async function createOrReusePending(data: PendingRegistrationData) {
  const pending = await prisma.preRegistration.findFirst({
    where: { ownerEmail: data.ownerEmail, status: "PENDING" },
    select: { id: true },
    orderBy: { createdAt: "desc" },
  });
  if (pending) return prisma.preRegistration.update({ where: { id: pending.id }, data });

  try {
    return await prisma.preRegistration.create({ data });
  } catch (error) {
    const isDuplicate =
      error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
    if (!isDuplicate) throw error;

    const winner = await prisma.preRegistration.findFirstOrThrow({
      where: { ownerEmail: data.ownerEmail, status: "PENDING" },
      select: { id: true },
      orderBy: { createdAt: "desc" },
    });
    return prisma.preRegistration.update({ where: { id: winner.id }, data });
  }
}

/**
 * Envia o código e falha ALTO se ele não sair. Sem isso o cadastro parava numa
 * tela pedindo um código que nunca ia chegar, e nem nós nem o usuário
 * ficávamos sabendo — o envio era disparado e o resultado, descartado.
 */
async function issueCodeOrThrow(input: IssueVerificationInput): Promise<void> {
  const { sent } = await issueVerificationCode(input);
  if (sent) return;
  const channelLabel = input.channel === "EMAIL" ? "e-mail" : "WhatsApp";
  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: `Não conseguimos enviar o código para seu ${channelLabel} agora. Confira o dado informado e tente de novo em alguns minutos.`,
  });
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

      const passwordHash = hashSync(input.password, BCRYPT_ROUNDS);
      const planId = await resolvePlanIdBySlug(input.planSlug);
      const pr = await createOrReusePending({
        tradeName: input.tradeName?.trim() || "Loja NO-KYC",
        ownerName: input.ownerName,
        ownerEmail: email,
        ownerPhone: phone,
        passwordHash,
        planId,
        emailVerifiedAt: null,
        phoneVerifiedAt: null,
      });

      await issueCodeOrThrow({ target: email, channel: "EMAIL", preRegistrationId: pr.id });
      logger.info("NO-KYC: pré-cadastro iniciado", { id: pr.id, planId });

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
      // Encadeia a verificação do telefone. Aqui NÃO lançamos se o envio falhar:
      // o e-mail já foi verificado e o código já foi queimado, então voltar o
      // usuário pra etapa anterior o deixaria sem saída. Avança e avisa — ele
      // resolve com "Reenviar código".
      const { sent } = await issueVerificationCode({
        target: pr.ownerPhone,
        channel: "WHATSAPP",
        preRegistrationId: pr.id,
      });
      logger.info("NO-KYC: e-mail verificado", { id: pr.id, phoneCodeSent: sent });

      return { phoneMasked: maskPhone(pr.ownerPhone), codeSent: sent };
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

      // Avisa o superadmin AQUI, e não no `startRegistration`: só agora o
      // cadastro está completo (e-mail e telefone verificados) e realmente
      // entrou na fila. Avisar antes encheria a caixa de entrada de tentativas
      // abandonadas na primeira tela.
      //
      // Fora de qualquer transação e sem `await` no caminho crítico do usuário?
      // Não: com `await`, porque o serviço nunca lança e a espera é de um envio
      // de e-mail. Soltar a promise deixaria a falha sem log em serverless.
      const plan = pr.planId
        ? await prisma.plan.findUnique({ where: { id: pr.planId }, select: { name: true } })
        : null;
      await notifyNewPreRegistration({
        preRegistrationId: pr.id,
        tradeName: pr.tradeName,
        ownerName: pr.ownerName,
        ownerEmail: pr.ownerEmail,
        planName: plan?.name ?? null,
      });

      return { done: true };
    }),

  /** Reenvia o código do canal pedido para um pré-cadastro pendente. */
  resendCode: publicProcedure
    .use(rateLimitMiddleware({ limit: 5, windowMs: 15 * 60 * 1000 }))
    .input(resendNoKycCodeSchema)
    .mutation(async ({ input }) => {
      const pr = await loadPending(input.preRegistrationId);
      const target = input.channel === "EMAIL" ? pr.ownerEmail : pr.ownerPhone;
      await issueCodeOrThrow({ target, channel: input.channel, preRegistrationId: pr.id });
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
