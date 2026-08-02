/**
 * Avisos de cobrança (ADR 0061) contra o banco real.
 *
 * O defeito de origem: NADA avisava o cliente em ponto algum do funil de billing
 * — nem antes de vencer, nem ao vencer, nem antes de suspender, nem ao suspender.
 * Ele descobria a suspensão ao tentar trabalhar.
 *
 * O risco ao corrigir é o oposto: um cron diário que reenvia "sua assinatura
 * venceu" todo dia da carência. Estes testes fixam as duas pontas.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const sendEmailMock = vi.fn(async () => ({ success: true, messageId: "m1" }));
const sendWhatsappMock = vi.fn(async () => ({ success: true, via: "text" as const, messageId: "w1" }));

vi.mock("@/lib/services/email-service", () => ({ sendEmail: (...a: unknown[]) => sendEmailMock(...(a as [])) }));
vi.mock("@/lib/whatsapp/send-with-fallback", () => ({
  sendTextWithFallback: (...a: unknown[]) => sendWhatsappMock(...(a as [])),
}));

import {
  claimDunningNotices,
  deliverDunningNotices,
} from "@/server/services/subscription-dunning.service";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const suffix = Date.now().toString(36);
const GRACE = 5;
const now = new Date("2026-07-10T12:00:00.000Z");
const daysFromNow = (days: number) => new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

let planId: string;
let tenantId: string;
let userId: string;
let subscriptionId: string;

/** Roda o ciclo completo do cron: reserva numa transação, entrega fora dela. */
async function runDunning() {
  const targets = await prisma.$transaction((tx) => claimDunningNotices(tx, { now, graceDays: GRACE }));
  const mine = targets.filter((t) => t.tenantId === tenantId);
  return deliverDunningNotices(mine, {
    graceDays: GRACE,
    appUrl: "https://app.teste",
    stamp: async (id, data) => {
      await prisma.subscriptionNotification.update({ where: { id }, data });
    },
  });
}

async function setSubscription(status: string, periodEnd: Date) {
  await prisma.subscription.update({
    where: { id: subscriptionId },
    data: { status: status as never, currentPeriodEnd: periodEnd },
  });
}

async function notices() {
  return prisma.subscriptionNotification.findMany({
    where: { subscriptionId },
    orderBy: { createdAt: "asc" },
  });
}

beforeAll(async () => {
  const plan = await prisma.plan.create({
    data: { name: `Dun ${suffix}`, slug: `dun-${suffix}`, monthlyPrice: "149.00", features: { modules: ["pdv"] }, status: "ACTIVE" },
  });
  planId = plan.id;
  const tenant = await prisma.tenant.create({
    data: { name: `Loja Dun ${suffix}`, slug: `dun-tenant-${suffix}`, status: "ACTIVE" },
  });
  tenantId = tenant.id;
  const user = await prisma.user.create({
    data: { name: "Dono Teste", email: `dun-${suffix}@teste.local`, phone: "5586999990000", passwordHash: "x" },
  });
  userId = user.id;
  await prisma.userTenant.create({ data: { userId, tenantId, role: "admin" } });
  const sub = await prisma.subscription.create({
    data: { tenantId, planId, status: "ACTIVE", billingCycle: "MONTHLY", amountCents: 14900, currentPeriodEnd: daysFromNow(30) },
  });
  subscriptionId = sub.id;
});

afterAll(async () => {
  await prisma.subscriptionNotification.deleteMany({ where: { tenantId } });
  await prisma.subscription.deleteMany({ where: { tenantId } });
  await prisma.userTenant.deleteMany({ where: { tenantId } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.plan.deleteMany({ where: { id: planId } });
  await prisma.$disconnect();
});

beforeEach(async () => {
  sendEmailMock.mockClear();
  sendWhatsappMock.mockClear();
  sendEmailMock.mockResolvedValue({ success: true, messageId: "m1" });
  await prisma.subscriptionNotification.deleteMany({ where: { subscriptionId } });
});

describe("dunning — quando avisa", () => {
  it("assinatura longe do vencimento: não avisa nada", async () => {
    await setSubscription("ACTIVE", daysFromNow(30));
    const r = await runDunning();
    expect(r.emailsSent).toBe(0);
    expect(await notices()).toHaveLength(0);
  });

  it("vence em 2 dias: avisa por e-mail e WhatsApp", async () => {
    await setSubscription("ACTIVE", daysFromNow(2));
    const r = await runDunning();
    expect(r.emailsSent).toBe(1);
    expect(r.whatsappSent).toBe(1);
    const rows = await notices();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.kind).toBe("DUE_SOON");
    expect(rows[0]!.emailSentAt).toBeInstanceOf(Date);
  });

  it("suspensa: avisa que o acesso foi pausado", async () => {
    await setSubscription("SUSPENDED", daysFromNow(-20));
    await runDunning();
    const rows = await notices();
    expect(rows.map((r) => r.kind)).toEqual(["SUSPENDED"]);
  });

  it("véspera da suspensão: manda os dois avisos", async () => {
    await setSubscription("PAST_DUE", daysFromNow(-4));
    await runDunning();
    const kinds = (await notices()).map((r) => r.kind).sort();
    expect(kinds).toEqual(["GRACE_ENDING", "PAST_DUE"]);
  });
});

describe("dunning — idempotência (não perseguir o cliente)", () => {
  it("rodar o cron 3× no mesmo ciclo envia UMA vez", async () => {
    await setSubscription("PAST_DUE", daysFromNow(-1));

    await runDunning();
    expect(sendEmailMock).toHaveBeenCalledTimes(1);

    await runDunning();
    await runDunning();
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(await notices()).toHaveLength(1);
  });

  it("pagou e o período avançou: o ciclo NOVO volta a poder avisar", async () => {
    await setSubscription("PAST_DUE", daysFromNow(-1));
    await runDunning();
    expect(sendEmailMock).toHaveBeenCalledTimes(1);

    // Pagamento: o vencimento anda um ciclo e a assinatura reativa. Depois vence
    // de novo — o aviso do ciclo novo não pode ser engolido pela trava do antigo.
    await setSubscription("PAST_DUE", daysFromNow(29));
    await runDunning();

    expect(sendEmailMock).toHaveBeenCalledTimes(2);
    expect(await notices()).toHaveLength(2);
  });
});

describe("dunning — falha de envio", () => {
  it("e-mail que não sai NÃO é dado por enviado, e o cron seguinte tenta de novo", async () => {
    await setSubscription("PAST_DUE", daysFromNow(-1));
    sendEmailMock.mockResolvedValueOnce({ success: false, error: "dominio nao verificado" } as never);

    const first = await runDunning();
    expect(first.failures).toBeGreaterThan(0);
    expect((await notices())[0]!.emailSentAt).toBeNull();

    const second = await runDunning();
    expect(second.emailsSent).toBe(1);
    expect((await notices())[0]!.emailSentAt).toBeInstanceOf(Date);
  });

  it("uma linha só por (assinatura, tipo, ciclo), mesmo com retry", async () => {
    await setSubscription("PAST_DUE", daysFromNow(-1));
    sendEmailMock.mockResolvedValueOnce({ success: false, error: "falhou" } as never);
    await runDunning();
    await runDunning();
    expect(await notices()).toHaveLength(1);
  });
});
