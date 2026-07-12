/**
 * Guardião da unificação do plano em Subscription (FK).
 *
 * Prova que `resolveTenantPlan` usa a Subscription como fonte canônica (mesmo com
 * `Tenant.plan` = null) e cai no fallback `Tenant.plan` só quando não há
 * Subscription. É a rede que impede a divergência plano-de-billing vs plano-de-acesso
 * de voltar.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { resolveTenantPlan } from "@/server/services/tenant-plan.service";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const suffix = Date.now().toString(36);
let planId: string;
const createdTenantIds: string[] = [];

async function makeTenant(plan: string | null): Promise<string> {
  const t = await prisma.tenant.create({
    data: { name: `Plan Test ${suffix}`, slug: `plan-test-${suffix}-${createdTenantIds.length}`, plan },
  });
  createdTenantIds.push(t.id);
  return t.id;
}

beforeAll(async () => {
  const plan = await prisma.plan.create({
    data: {
      name: `Guardião ${suffix}`,
      slug: `guardiao-${suffix}`,
      monthlyPrice: "99.90",
      maxUsers: 7,
      maxImeiQueries: 123,
      features: { modules: ["wallet", "pdv"] },
      status: "ACTIVE",
    },
  });
  planId = plan.id;
});

afterAll(async () => {
  await prisma.subscription.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
  await prisma.tenant.deleteMany({ where: { id: { in: createdTenantIds } } });
  await prisma.plan.deleteMany({ where: { id: planId } });
  await prisma.$disconnect();
});

describe("resolveTenantPlan — Subscription é a fonte canônica", () => {
  it("resolve o plano via Subscription mesmo com Tenant.plan = null", async () => {
    const tenantId = await makeTenant(null); // sombra vazia de propósito
    await prisma.subscription.create({
      data: { tenantId, planId, status: "ACTIVE", billingCycle: "MONTHLY", amountCents: 9990 },
    });

    const resolved = await resolveTenantPlan(prisma, tenantId);
    expect(resolved?.id).toBe(planId);
    expect(resolved?.maxUsers).toBe(7);
    expect(resolved?.maxImeiQueries).toBe(123);
  });

  it("PAST_DUE (carência) ainda concede o plano", async () => {
    const tenantId = await makeTenant(null);
    await prisma.subscription.create({
      data: { tenantId, planId, status: "PAST_DUE", billingCycle: "MONTHLY", amountCents: 9990 },
    });
    const resolved = await resolveTenantPlan(prisma, tenantId);
    expect(resolved?.id).toBe(planId);
  });

  it("SUSPENDED/CANCELLED não concedem plano via Subscription", async () => {
    const tenantId = await makeTenant(null);
    await prisma.subscription.create({
      data: { tenantId, planId, status: "CANCELLED", billingCycle: "MONTHLY", amountCents: 9990 },
    });
    const resolved = await resolveTenantPlan(prisma, tenantId);
    expect(resolved).toBeNull();
  });

  it("fallback: sem Subscription, usa Tenant.plan (legado em transição)", async () => {
    const tenantId = await makeTenant(planId); // sombra preenchida, sem subscription
    const resolved = await resolveTenantPlan(prisma, tenantId);
    expect(resolved?.id).toBe(planId);
  });

  it("sem Subscription e sem Tenant.plan => null (NO-KYC sem plano)", async () => {
    const tenantId = await makeTenant(null);
    const resolved = await resolveTenantPlan(prisma, tenantId);
    expect(resolved).toBeNull();
  });
});

describe("FK subscriptions.plan_id — defesa em profundidade", () => {
  it("o banco recusa apagar um plano em uso (ON DELETE RESTRICT)", async () => {
    const tenantId = await makeTenant(null);
    await prisma.subscription.create({
      data: { tenantId, planId, status: "ACTIVE", billingCycle: "MONTHLY", amountCents: 9990 },
    });
    await expect(prisma.plan.delete({ where: { id: planId } })).rejects.toThrow();
  });
});
