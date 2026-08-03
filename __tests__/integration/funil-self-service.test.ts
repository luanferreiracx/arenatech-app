/**
 * O funil self-service ponta a ponta (ADR 0061): o visitante escolhe o plano na
 * página de preços, se cadastra, o superadmin aprova — e o tenant nasce TESTANDO
 * aquele plano.
 *
 * Este teste roda contra os ROUTERS DE VERDADE e o banco de verdade. É de
 * propósito: a parte do funil que quebra em silêncio não é a validação de um
 * campo, é a costura entre três donos diferentes (página → cadastro → aprovação)
 * concordando sobre o mesmo plano. Um teste que só espelhasse a regra de
 * validação passaria com o funil quebrado.
 *
 * O que se prova aqui:
 *
 * - o plano escolhido sobrevive de `?plano=<slug>` até `Subscription.planId`;
 * - a aprovação abre assinatura em `TRIALING`, com vencimento no fim do teste
 *   (sem isso, o tenant ganharia os módulos sem cobrança e sem prazo — acesso
 *   liberado que nunca vence e não aparece em receita);
 * - slug inválido/legado degrada para "sem plano" em vez de derrubar o cadastro;
 * - quem entra sem plano NÃO ganha assinatura (não há o que cobrar).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Os routers puxam a árvore do tRPC (NextAuth) — mesmo mock dos demais caller-tests.
vi.mock("@/server/auth", () => ({ auth: async () => null }));

// O código de verificação é hasheado e NUNCA volta ao chamador (por segurança).
// Para dirigir o fluxo inteiro, trocamos o serviço: emitir sempre "enviou",
// validar sempre "conferiu". O que este teste mede é o caminho do PLANO, não a
// criptografia do código — essa tem os testes dela.
vi.mock("@/server/services/verification.service", () => ({
  issueVerificationCode: async () => ({ sent: true }),
  verifyCode: async () => ({ ok: true }),
}));

import { createCallerFactory } from "@/server/api/trpc";
import { appRouter } from "@/server/api/root";
import { catalogPlanModules, PLAN_CATALOG } from "@/lib/plans/catalog";
import { DEFAULT_TRIAL_DAYS } from "@/server/services/platform-settings.service";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const suffix = Date.now().toString(36);
const CATALOG_PLAN_SLUG = "completo";

/**
 * Chamador anônimo — é assim que o visitante fala com o cadastro.
 *
 * `headers` de verdade: o rate-limit do cadastro público lê o IP da requisição
 * (`x-forwarded-for`). Sem elas o middleware estoura antes de chegar ao
 * procedure. Cada chamada leva um IP próprio para uma execução não gastar a cota
 * da seguinte.
 */
let ipCounter = 0;
const anon = () =>
  createCallerFactory(appRouter)({
    session: null,
    tenantId: null,
    headers: new Headers({ "x-forwarded-for": `10.0.${++ipCounter % 256}.${ipCounter % 250 + 1}` }),
  } as never);

/** Chamador superadmin — é quem aprova. */
const superadmin = (userId: string) =>
  createCallerFactory(appRouter)({
    session: { user: { id: userId, isSuperAdmin: true }, activeTenantId: null, availableTenants: [] },
    tenantId: null,
  } as never);

let superadminId: string;
let planoCompletoId: string;
const emailsCriados: string[] = [];
const tenantsCriados: string[] = [];

/**
 * Faz o cadastro inteiro (dados → e-mail → WhatsApp) e devolve o pré-cadastro.
 *
 * E-mail único por CHAMADA, não por plano: o e-mail é a identidade do NO-KYC, e
 * um caso que aprova o cadastro cria o usuário — o caso seguinte com o mesmo
 * e-mail levaria CONFLICT.
 */
let cadastroSeq = 0;
async function cadastrar(planSlug: string | null) {
  const email = `funil-${suffix}-${++cadastroSeq}@exemplo.test`;
  emailsCriados.push(email);

  const started = await anon().noKyc.startRegistration({
    ownerName: "Dono da Loja",
    tradeName: "Loja do Funil",
    email,
    phone: "86999990000",
    password: "senha1234",
    confirmPassword: "senha1234",
    planSlug,
  });

  await anon().noKyc.verifyEmail({ preRegistrationId: started.preRegistrationId, code: "123456" });
  await anon().noKyc.verifyPhone({ preRegistrationId: started.preRegistrationId, code: "123456" });

  const pr = await prisma.preRegistration.findUniqueOrThrow({
    where: { id: started.preRegistrationId },
  });
  return pr;
}

beforeAll(async () => {
  const plano = await prisma.plan.findUnique({ where: { slug: CATALOG_PLAN_SLUG } });
  if (!plano) throw new Error(`Plano '${CATALOG_PLAN_SLUG}' ausente. Rode o seed.`);
  planoCompletoId = plano.id;

  superadminId = (
    await prisma.user.create({
      data: {
        name: `Superadmin Funil ${suffix}`,
        cpf: `8${Date.now()}`.slice(0, 11),
        passwordHash: "x",
        isSuperAdmin: true,
      },
    })
  ).id;
});

afterAll(async () => {
  await prisma.subscription.deleteMany({ where: { tenantId: { in: tenantsCriados } } });
  await prisma.auditLog.deleteMany({ where: { tenantId: { in: tenantsCriados } } });
  await prisma.tenantSettings.deleteMany({ where: { tenantId: { in: tenantsCriados } } });
  await prisma.userTenant.deleteMany({ where: { tenantId: { in: tenantsCriados } } });
  await prisma.preRegistration.deleteMany({ where: { ownerEmail: { in: emailsCriados } } });
  await prisma.user.deleteMany({ where: { email: { in: emailsCriados } } });
  await prisma.tenant.deleteMany({ where: { id: { in: tenantsCriados } } });
  await prisma.user.deleteMany({ where: { id: superadminId } });
  await prisma.$disconnect();
});

describe("plano escolhido na vitrine chega até o cadastro", () => {
  it("slug do catálogo vira o planId do pré-cadastro", async () => {
    const pr = await cadastrar(CATALOG_PLAN_SLUG);
    expect(pr.planId).toBe(planoCompletoId);
  });

  it("slug de plano LEGADO não vira escolha (free/pro não estão à venda)", async () => {
    // `free` e `pro` seguem ACTIVE no banco porque um tenant aponta pra eles.
    // Contratá-los por URL daria o sistema de graça.
    const pr = await cadastrar("free");
    expect(pr.planId).toBeNull();
  });

  it("slug inventado degrada para 'sem plano' em vez de derrubar o cadastro", async () => {
    // A pessoa está no meio do cadastro; um parâmetro torto não pode custar a
    // conta dela. O superadmin escolhe o plano na aprovação.
    const pr = await cadastrar("plano-que-nao-existe");
    expect(pr.planId).toBeNull();
    expect(pr.status).toBe("PENDING");
  });

  it("sem plano nenhum, o cadastro completa igual", async () => {
    const pr = await cadastrar(null);
    expect(pr.planId).toBeNull();
    expect(pr.emailVerifiedAt).not.toBeNull();
    expect(pr.phoneVerifiedAt).not.toBeNull();
  });
});

describe("aprovação abre o teste grátis no plano escolhido", () => {
  it("tenant nasce TRIALING, com vencimento no fim do teste e os módulos do plano", async () => {
    const pr = await cadastrar(CATALOG_PLAN_SLUG);
    const antes = Date.now();

    const aprovado = await superadmin(superadminId).admin.approvePreRegistration({ id: pr.id });
    tenantsCriados.push(aprovado.tenantId);

    const sub = await prisma.subscription.findUnique({
      where: { tenantId: aprovado.tenantId },
      include: { plan: true },
    });

    // A assinatura EXISTE. Sem ela, o tenant teria os módulos via `Tenant.plan` e
    // nenhuma cobrança — acesso que nunca vence e não conta como receita.
    expect(sub).not.toBeNull();
    expect(sub!.status).toBe("TRIALING");
    expect(sub!.planId).toBe(planoCompletoId);
    expect(sub!.plan.slug).toBe(CATALOG_PLAN_SLUG);

    // Vencimento = fim do teste. Tolerância de 1 min cobre o tempo do teste rodar.
    const esperado = antes + DEFAULT_TRIAL_DAYS * 24 * 60 * 60 * 1000;
    expect(Math.abs(sub!.currentPeriodEnd!.getTime() - esperado)).toBeLessThan(60_000);

    // O tenant recebe os módulos do plano (é o que ele está testando).
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: aprovado.tenantId } });
    expect(tenant.plan).toBe(planoCompletoId);
    expect(tenant.status).toBe("ACTIVE");

    const modulosDoPlano = catalogPlanModules(
      PLAN_CATALOG.find((p) => p.slug === CATALOG_PLAN_SLUG)!,
    );
    const gravados = (sub!.plan.features as { modules?: string[] } | null)?.modules ?? [];
    expect([...gravados].sort()).toEqual([...modulosDoPlano].sort());
  });

  it("sem plano escolhido, a aprovação NÃO cria assinatura", async () => {
    // Não há o que cobrar nem o que expirar. Criar uma assinatura zerada faria o
    // tenant aparecer nas métricas de receita e no funil de cobrança sem nunca
    // ter comprado nada.
    const pr = await cadastrar(null);
    const aprovado = await superadmin(superadminId).admin.approvePreRegistration({ id: pr.id });
    tenantsCriados.push(aprovado.tenantId);

    const sub = await prisma.subscription.findUnique({ where: { tenantId: aprovado.tenantId } });
    expect(sub).toBeNull();

    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: aprovado.tenantId } });
    expect(tenant.plan).toBeNull();
    // Ainda assim vira um tenant ATIVO: ele usa a carteira e escolhe o plano depois.
    expect(tenant.status).toBe("ACTIVE");
  });

  it("o superadmin pode corrigir o plano na aprovação, vencendo a escolha do cliente", async () => {
    const pr = await cadastrar(CATALOG_PLAN_SLUG);
    const outro = await prisma.plan.findUniqueOrThrow({ where: { slug: "assistencia" } });

    const aprovado = await superadmin(superadminId).admin.approvePreRegistration({
      id: pr.id,
      planId: outro.id,
    });
    tenantsCriados.push(aprovado.tenantId);

    const sub = await prisma.subscription.findUniqueOrThrow({
      where: { tenantId: aprovado.tenantId },
    });
    expect(sub.planId).toBe(outro.id);
    expect(sub.status).toBe("TRIALING");
  });
});

describe("a vitrine pública", () => {
  it("publicPlans mostra só o catálogo, nunca os planos legados", async () => {
    const planos = await anon().admin.publicPlans();
    const slugs = planos.map((p) => p.slug);
    expect(slugs).not.toContain("free");
    expect(slugs).not.toContain("pro");
    expect(slugs.length).toBeGreaterThan(0);
  });

  it("publicPlans NUNCA expõe o gating de módulos", async () => {
    // P2 da auditoria 2026-07-14. O guard vive em `toPublicPlanView`; aqui se
    // prova que o endpoint realmente o usa.
    const planos = await anon().admin.publicPlans();
    expect(JSON.stringify(planos)).not.toContain("modules");
    expect(JSON.stringify(planos)).not.toContain("pdv-retail");
  });

  it("publicPlanBySlug confirma plano do catálogo e recusa legado/inexistente", async () => {
    const completo = await anon().admin.publicPlanBySlug({ slug: CATALOG_PLAN_SLUG });
    expect(completo?.slug).toBe(CATALOG_PLAN_SLUG);
    expect(completo?.highlights.length).toBeGreaterThan(0);

    expect(await anon().admin.publicPlanBySlug({ slug: "pro" })).toBeNull();
    expect(await anon().admin.publicPlanBySlug({ slug: "nao-existe" })).toBeNull();
  });

  it("publicTrialDays anuncia o mesmo prazo que a aprovação aplica", async () => {
    // A promessa da vitrine e o prazo real vindos da MESMA fonte. Hardcodar o
    // número na página faria o dono mudar o padrão e a vitrine seguir mentindo.
    const { trialDays } = await anon().admin.publicTrialDays();
    const settings = await prisma.platformSettings.findUnique({ where: { id: "singleton" } });
    expect(trialDays).toBe(settings?.trialDays);
  });
});
