/**
 * Renovação da assinatura por pagamento DePix (ADR 0058) — foco em IDEMPOTÊNCIA.
 *
 * DINHEIRO: um webhook duplicado NÃO pode empurrar o período 2×. Prova que dois
 * disparos de renewSubscriptionFromPayment sobre o MESMO depósito avançam o
 * período uma única vez, e que reativa o tenant suspenso.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// O service importa CENTRAL_TENANT_SLUG de trpc.ts, que puxa NextAuth (next/server).
// Mock igual aos demais testes que tocam a árvore do trpc.
vi.mock("@/server/auth", () => ({ auth: async () => null }));

import { renewSubscriptionFromPayment } from "@/server/services/subscription-billing.service";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const suffix = Date.now().toString(36);
let planId: string;
let tenantId: string;
let centralTenantId: string;
let subscriptionId: string;
let depositId: string;
let sysUserId: string;

// vencimento inicial no futuro — pagar avança +1 mês a partir dele.
const initialPeriodEnd = new Date("2026-08-01T00:00:00.000Z");

beforeAll(async () => {
  const central = await prisma.tenant.findFirstOrThrow({ where: { slug: "arena-tech" } });
  centralTenantId = central.id;
  sysUserId = (await prisma.user.findFirstOrThrow({ where: { isSuperAdmin: true } })).id;

  const plan = await prisma.plan.create({
    data: { name: `Renew ${suffix}`, slug: `renew-${suffix}`, monthlyPrice: "99.90", features: { modules: ["wallet"] }, status: "ACTIVE" },
  });
  planId = plan.id;
  const tenant = await prisma.tenant.create({
    data: { name: `Renew ${suffix}`, slug: `renew-tenant-${suffix}`, status: "SUSPENDED" }, // suspenso p/ provar reativação
  });
  tenantId = tenant.id;
  const sub = await prisma.subscription.create({
    data: { tenantId, planId, status: "PAST_DUE", billingCycle: "MONTHLY", amountCents: 9990, currentPeriodEnd: initialPeriodEnd },
  });
  subscriptionId = sub.id;

  // Depósito de cobrança confirmado, no tenant CENTRAL, sourceType SUBSCRIPTION.
  const dep = await prisma.tenantDepixTransaction.create({
    data: {
      tenantId: centralTenantId,
      number: `TXD-SUB-${suffix}`,
      kind: "DEPOSIT",
      status: "PROCESSING",
      sourceType: "SUBSCRIPTION",
      sourceId: subscriptionId,
      grossAmountCents: 9990,
      userId: sysUserId,
    },
  });
  depositId = dep.id;
});

afterAll(async () => {
  await prisma.tenantDepixTransaction.deleteMany({ where: { id: depositId } });
  await prisma.subscription.deleteMany({ where: { id: subscriptionId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.plan.deleteMany({ where: { id: planId } });
  await prisma.$disconnect();
});

function depositRow() {
  return { id: depositId, tenantId: centralTenantId, sourceType: "SUBSCRIPTION", sourceId: subscriptionId };
}

describe("renewSubscriptionFromPayment — idempotência (dinheiro)", () => {
  it("1º disparo renova (avança 1 ciclo, reativa tenant), 2º disparo é no-op", async () => {
    const first = await renewSubscriptionFromPayment(depositRow());
    expect(first.applied).toBe(true);

    const afterFirst = await prisma.subscription.findUniqueOrThrow({ where: { id: subscriptionId } });
    const tenantAfter = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    // +1 mês a partir do vencimento futuro (não perde dias).
    expect(afterFirst.currentPeriodEnd?.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(afterFirst.status).toBe("ACTIVE");
    expect(tenantAfter.status).toBe("ACTIVE"); // reativado

    // 2º disparo (webhook duplicado) — NÃO avança de novo.
    const second = await renewSubscriptionFromPayment(depositRow());
    expect(second.applied).toBe(false);

    const afterSecond = await prisma.subscription.findUniqueOrThrow({ where: { id: subscriptionId } });
    expect(afterSecond.currentPeriodEnd?.toISOString()).toBe("2026-09-01T00:00:00.000Z"); // inalterado
  });

  it("não renova assinatura CANCELADA (pagamento não reativa sozinho)", async () => {
    await prisma.subscription.update({ where: { id: subscriptionId }, data: { status: "CANCELLED" } });
    // zera a guarda p/ o teste enxergar o ramo de cancelada (novo depósito).
    const dep2 = await prisma.tenantDepixTransaction.create({
      data: { tenantId: centralTenantId, number: `TXD-SUB2-${suffix}`, kind: "DEPOSIT", status: "PROCESSING", sourceType: "SUBSCRIPTION", sourceId: subscriptionId, grossAmountCents: 9990, userId: sysUserId },
    });
    const res = await renewSubscriptionFromPayment({ id: dep2.id, tenantId: centralTenantId, sourceType: "SUBSCRIPTION", sourceId: subscriptionId });
    expect(res.applied).toBe(false);
    await prisma.tenantDepixTransaction.deleteMany({ where: { id: dep2.id } });
  });

  it("ignora depósito que não é de assinatura", async () => {
    const res = await renewSubscriptionFromPayment({ id: depositId, tenantId: centralTenantId, sourceType: "QUICK_SALE", sourceId: "x" });
    expect(res.applied).toBe(false);
  });
});
