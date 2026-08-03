/**
 * Avisos do onboarding (ADR 0064): as duas pontas da fila de aprovação.
 *
 * O funil terminava em silêncio dos dois lados — o superadmin só descobria o
 * cadastro abrindo a fila por conta própria, e a pessoa aprovada não recebia
 * nada (a tela `/register/pending` prometia um WhatsApp que ninguém mandava).
 *
 * O que se prova aqui, e que só um teste de integração pega:
 *
 * 1. o aviso REALMENTE dispara nos dois pontos do fluxo;
 * 2. a falha do provedor NÃO derruba cadastro nem aprovação — é a propriedade
 *    que importa, porque o custo de errar é assimétrico: perder um aviso é
 *    recuperável (a fila continua na tela), perder a aprovação não é (o
 *    pré-cadastro já foi consumido);
 * 3. senha temporária nunca sai por WhatsApp.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

vi.mock("@/server/auth", () => ({ auth: async () => null }));
vi.mock("@/server/services/verification.service", () => ({
  issueVerificationCode: async () => ({ sent: true }),
  verifyCode: async () => ({ ok: true }),
}));

// Espiões nos DOIS canais. O serviço de aviso é real; só a saída de rede é
// trocada — é o que permite afirmar que o aviso saiu, e com qual conteúdo.
type EmailArg = { to: string; subject: string; html: string };
type WhatsappArg = { phone: string; freeText: string; contexto: string; params: string[] };

const sendEmail = vi.fn(async (_arg: EmailArg) => ({ success: true, messageId: "test" }));
const sendTextWithFallback = vi.fn(async (_arg: WhatsappArg) => ({
  success: true,
  via: "text" as const,
}));
vi.mock("@/lib/services/email-service", () => ({
  sendEmail: (arg: EmailArg) => sendEmail(arg),
}));
vi.mock("@/lib/whatsapp/send-with-fallback", () => ({
  sendTextWithFallback: (arg: WhatsappArg) => sendTextWithFallback(arg),
}));

import { createCallerFactory } from "@/server/api/trpc";
import { appRouter } from "@/server/api/root";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const suffix = Date.now().toString(36);
let superadminId: string;
let superadminEmail: string;
const emails: string[] = [];
const tenants: string[] = [];

let ip = 0;
const anon = () =>
  createCallerFactory(appRouter)({
    session: null,
    tenantId: null,
    headers: new Headers({ "x-forwarded-for": `10.9.${++ip % 256}.${(ip % 250) + 1}` }),
  } as never);

const admin = () =>
  createCallerFactory(appRouter)({
    session: { user: { id: superadminId, isSuperAdmin: true }, activeTenantId: null, availableTenants: [] },
    tenantId: null,
  } as never);

let seq = 0;
async function cadastrar() {
  const email = `notify-${suffix}-${++seq}@exemplo.test`;
  emails.push(email);
  const started = await anon().noKyc.startRegistration({
    ownerName: "Maria da Silva",
    tradeName: `Loja Notify ${seq}`,
    email,
    phone: "86999991234",
    password: "senha1234",
    confirmPassword: "senha1234",
    acceptedTerms: true,
    planSlug: "completo",
  });
  await anon().noKyc.verifyEmail({ preRegistrationId: started.preRegistrationId, code: "123456" });
  await anon().noKyc.verifyPhone({ preRegistrationId: started.preRegistrationId, code: "123456" });
  return started.preRegistrationId;
}

beforeAll(async () => {
  superadminEmail = `super-notify-${suffix}@exemplo.test`;
  emails.push(superadminEmail);
  superadminId = (
    await prisma.user.create({
      data: {
        name: `Super Notify ${suffix}`,
        cpf: `7${Date.now()}`.slice(0, 11),
        email: superadminEmail,
        passwordHash: "x",
        isSuperAdmin: true,
      },
    })
  ).id;
});

beforeEach(() => {
  sendEmail.mockClear();
  sendTextWithFallback.mockClear();
  sendEmail.mockImplementation(async () => ({ success: true, messageId: "test" }));
  sendTextWithFallback.mockImplementation(async () => ({ success: true, via: "text" as const }));
});

afterAll(async () => {
  await prisma.subscription.deleteMany({ where: { tenantId: { in: tenants } } });
  await prisma.auditLog.deleteMany({ where: { tenantId: { in: tenants } } });
  await prisma.tenantSettings.deleteMany({ where: { tenantId: { in: tenants } } });
  await prisma.userTenant.deleteMany({ where: { tenantId: { in: tenants } } });
  await prisma.preRegistration.deleteMany({ where: { ownerEmail: { in: emails } } });
  await prisma.user.deleteMany({ where: { email: { in: emails } } });
  await prisma.tenant.deleteMany({ where: { id: { in: tenants } } });
  await prisma.$disconnect();
});

describe("superadmin fica sabendo do cadastro novo", () => {
  it("avisa quando o cadastro COMPLETA, com o plano escolhido no corpo", async () => {
    await cadastrar();

    const paraSuper = sendEmail.mock.calls
      .map(([arg]) => arg)
      .filter((a) => a.to === superadminEmail);

    expect(paraSuper.length).toBeGreaterThan(0);
    expect(paraSuper[0]!.subject).toContain("Novo cadastro");
    // O plano escolhido tem que estar no aviso: aprovar é um ato comercial, e
    // quem aprova precisa ver o que o cliente contratou.
    expect(paraSuper[0]!.html).toContain("Completo");
    expect(paraSuper[0]!.html).toContain("Maria da Silva");
  });

  it("NÃO avisa na primeira etapa — só quando e-mail e telefone estão verificados", async () => {
    // Avisar em `startRegistration` encheria a caixa de entrada de tentativas
    // abandonadas na primeira tela, que nunca chegam à fila.
    const email = `notify-parcial-${suffix}@exemplo.test`;
    emails.push(email);
    await anon().noKyc.startRegistration({
      ownerName: "Abandonou no meio",
      email,
      phone: "86999995555",
      password: "senha1234",
      confirmPassword: "senha1234",
      acceptedTerms: true,
      planSlug: null,
    });

    const paraSuper = sendEmail.mock.calls
      .map(([arg]) => arg)
      .filter((a) => a.to === superadminEmail);
    expect(paraSuper).toHaveLength(0);
  });

  it("provedor de e-mail fora NÃO derruba o cadastro", async () => {
    // A pessoa já verificou e-mail e telefone. Perder o aviso é recuperável;
    // perder o cadastro dela, não.
    sendEmail.mockImplementation(async () => {
      throw new Error("Resend fora do ar");
    });

    const preRegId = await cadastrar();
    const pr = await prisma.preRegistration.findUniqueOrThrow({ where: { id: preRegId } });
    expect(pr.status).toBe("PENDING");
    expect(pr.phoneVerifiedAt).not.toBeNull();
  });
});

describe("quem se cadastrou fica sabendo da aprovação", () => {
  it("manda e-mail e WhatsApp com o fim do teste", async () => {
    const preRegId = await cadastrar();
    sendEmail.mockClear();
    sendTextWithFallback.mockClear();

    const aprovado = await admin().admin.approvePreRegistration({ id: preRegId });
    tenants.push(aprovado.tenantId);

    const paraCliente = sendEmail.mock.calls
      .map(([arg]) => arg)
      .filter((a) => a.to.startsWith("notify-"));
    expect(paraCliente.length).toBeGreaterThan(0);
    expect(paraCliente[0]!.subject).toMatch(/aprovada/i);
    // A data de fim do teste é a informação que decide o que a pessoa faz nos
    // próximos dias — tem que estar na mensagem.
    expect(paraCliente[0]!.html).toMatch(/\d{2}\/\d{2}\/\d{4}/);

    expect(sendTextWithFallback).toHaveBeenCalled();
  });

  it("NUNCA manda senha por WhatsApp", async () => {
    // A mensagem fica no aparelho, é encaminhável e passa por servidor de
    // terceiro. Credencial vai por e-mail, e só.
    const preRegId = await cadastrar();
    sendTextWithFallback.mockClear();

    const aprovado = await admin().admin.approvePreRegistration({ id: preRegId });
    tenants.push(aprovado.tenantId);

    const texto = JSON.stringify(sendTextWithFallback.mock.calls);
    expect(texto).not.toMatch(/senha\s*[:=]/i);
    // NO-KYC não gera senha temporária; se um dia gerar, ela não pode vazar aqui.
    if (aprovado.tempPassword) expect(texto).not.toContain(aprovado.tempPassword);
  });

  it("falha no envio NÃO desfaz a aprovação (o tenant fica criado)", async () => {
    const preRegId = await cadastrar();
    sendEmail.mockImplementation(async () => {
      throw new Error("Resend fora do ar");
    });
    sendTextWithFallback.mockImplementation(async () => {
      throw new Error("Meta fora do ar");
    });

    const aprovado = await admin().admin.approvePreRegistration({ id: preRegId });
    tenants.push(aprovado.tenantId);

    // O que não pode acontecer: o pré-cadastro ser consumido e o tenant sumir.
    const tenant = await prisma.tenant.findUnique({ where: { id: aprovado.tenantId } });
    expect(tenant).not.toBeNull();
    const sub = await prisma.subscription.findUnique({ where: { tenantId: aprovado.tenantId } });
    expect(sub?.status).toBe("TRIALING");
  });

  it("o retorno da aprovação não vaza o payload interno de aviso", async () => {
    const preRegId = await cadastrar();
    const aprovado = await admin().admin.approvePreRegistration({ id: preRegId });
    tenants.push(aprovado.tenantId);

    // `notify` era transporte para o serviço de aviso, não contrato do endpoint.
    expect("notify" in aprovado).toBe(false);
  });
});
