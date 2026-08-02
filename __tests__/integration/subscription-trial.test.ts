/**
 * Teste grátis (ADR 0061) contra o banco real.
 *
 * O trial reusa `currentPeriodEnd` e o cron de vencimento em vez de ter máquina
 * de estados própria. Isso é barato, mas só vale se as travas seguirem valendo:
 * o teste tem que CONCEDER acesso, NÃO contar como receita, ACABAR sozinho e
 * VIRAR assinatura paga quando o cliente paga.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

vi.mock("@/server/auth", () => ({ auth: async () => null }));

import { createCallerFactory } from "@/server/api/trpc";
import { appRouter } from "@/server/api/root";
import { runSubscriptionExpiry } from "@/server/services/subscription-expiry.service";
import { resolveTenantPlan } from "@/server/services/tenant-plan.service";
import { grantsPlanAccess, countsAsRevenue } from "@/lib/billing/subscription-status";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const suffix = Date.now().toString(36);
let planId: string;
let tenantId: string;
let superAdminId: string;

const adminCall = () =>
  createCallerFactory(appRouter)({
    session: { user: { id: superAdminId, isSuperAdmin: true } },
  } as never);

const daysFromNow = (days: number) => new Date(Date.now() + days * 24 * 60 * 60 * 1000);

beforeAll(async () => {
  superAdminId = (await prisma.user.findFirstOrThrow({ where: { isSuperAdmin: true } })).id;
  const plan = await prisma.plan.create({
    data: {
      name: `Trial ${suffix}`,
      slug: `trial-${suffix}`,
      monthlyPrice: "149.00",
      features: { modules: ["pdv"] },
      status: "ACTIVE",
    },
  });
  planId = plan.id;
  const tenant = await prisma.tenant.create({
    data: { name: `Trial ${suffix}`, slug: `trial-tenant-${suffix}`, status: "ACTIVE" },
  });
  tenantId = tenant.id;
});

afterAll(async () => {
  await prisma.subscriptionNotification.deleteMany({ where: { tenantId } });
  await prisma.auditLog.deleteMany({ where: { tenantId } });
  await prisma.subscription.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.plan.deleteMany({ where: { id: planId } });
  await prisma.$disconnect();
});

async function startTrial(trialDays?: number) {
  return adminCall().admin.activateSubscription({
    tenantId,
    planId,
    billingCycle: "MONTHLY",
    asTrial: true,
    trialDays,
  });
}

describe("iniciar teste grátis", () => {
  it("usa o padrão global quando não se informa o prazo", async () => {
    const settings = await adminCall().admin.platformSettings();
    const result = await startTrial();

    expect(result.status).toBe("TRIALING");
    const expectedDay = daysFromNow(settings.trialDays).toDateString();
    expect(result.currentPeriodEnd.toDateString()).toBe(expectedDay);
  });

  it("prazo informado vale só para este tenant, sem mexer no padrão global", async () => {
    const antes = await adminCall().admin.platformSettings();
    const result = await startTrial(21);
    const depois = await adminCall().admin.platformSettings();

    expect(result.currentPeriodEnd.toDateString()).toBe(daysFromNow(21).toDateString());
    expect(depois.trialDays).toBe(antes.trialDays);
  });

  it("o teste CONCEDE os módulos do plano", async () => {
    await startTrial(10);
    const plan = await resolveTenantPlan(prisma, tenantId);
    expect(plan?.id).toBe(planId);
    expect(grantsPlanAccess("TRIALING")).toBe(true);
  });

  it("o teste NÃO é receita", () => {
    expect(countsAsRevenue("TRIALING")).toBe(false);
  });

  it("registra no audit log como início de teste, não como ativação", async () => {
    await startTrial(10);
    const log = await prisma.auditLog.findFirst({
      where: { tenantId, action: "subscription.trial.start" },
      orderBy: { createdAt: "desc" },
    });
    expect(log).not.toBeNull();
  });
});

describe("estender o teste de um tenant", () => {
  it("redefine o fim para hoje + N dias", async () => {
    await startTrial(3);
    const result = await adminCall().admin.extendTrial({ tenantId, daysFromNow: 30 });
    expect(result.trialEndsAt.toDateString()).toBe(daysFromNow(30).toDateString());
  });

  it("recusa estender assinatura que não está em teste", async () => {
    await prisma.subscription.update({ where: { tenantId }, data: { status: "ACTIVE" } });
    // Empurrar a data de quem já paga seria dar mês de graça sem registro de
    // desconto, e o audit log diria "trial" para uma conta paga.
    await expect(adminCall().admin.extendTrial({ tenantId, daysFromNow: 30 })).rejects.toThrow(
      /em teste/i,
    );
  });
});

describe("fim do teste", () => {
  it("teste vencido entra em carência pelo mesmo caminho do vencimento", async () => {
    await startTrial(5);
    await prisma.subscription.update({
      where: { tenantId },
      data: { currentPeriodEnd: daysFromNow(-1) },
    });

    await prisma.$transaction((tx) =>
      runSubscriptionExpiry(tx, { now: new Date(), graceDays: 5 }),
    );

    const sub = await prisma.subscription.findUniqueOrThrow({ where: { tenantId } });
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    expect(sub.status).toBe("PAST_DUE");
    // Carência mantém o acesso: quem testou não perde a loja no dia seguinte.
    expect(tenant.status).toBe("ACTIVE");
  });

  it("pagar converte o teste em assinatura paga", async () => {
    await startTrial(5);
    await adminCall().admin.markSubscriptionPaid({ tenantId });

    const sub = await prisma.subscription.findUniqueOrThrow({ where: { tenantId } });
    expect(sub.status).toBe("ACTIVE");
    expect(countsAsRevenue(sub.status)).toBe(true);
  });
});

describe("configuração global de teste", () => {
  it("o superadmin muda o padrão e ele passa a valer para quem começar depois", async () => {
    const original = (await adminCall().admin.platformSettings()).trialDays;
    try {
      await adminCall().admin.updatePlatformSettings({ trialDays: 14 });
      const result = await startTrial();
      expect(result.currentPeriodEnd.toDateString()).toBe(daysFromNow(14).toDateString());
    } finally {
      await adminCall().admin.updatePlatformSettings({ trialDays: original });
    }
  });

  it("zero desliga o teste (o schema recusa iniciar com 0 dias)", async () => {
    await expect(
      adminCall().admin.activateSubscription({
        tenantId,
        planId,
        billingCycle: "MONTHLY",
        asTrial: true,
        trialDays: 0,
      }),
    ).rejects.toThrow();
  });
});
