/**
 * Vencimento de assinatura (cron expire-subscriptions) contra o banco real.
 *
 * Prova as duas transições: ACTIVE vencida → PAST_DUE (mantém acesso); PAST_DUE
 * além da carência → SUSPENDED + Tenant SUSPENDED (corta login). E que assinatura
 * no futuro / dentro da carência NÃO é tocada.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { runSubscriptionExpiry } from "@/server/services/subscription-expiry.service";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const suffix = Date.now().toString(36);
let planId: string;
const tenantIds: string[] = [];

const now = new Date("2026-07-10T12:00:00.000Z");
const GRACE = 5;
const inFuture = new Date("2026-08-01T00:00:00.000Z");
const justExpired = new Date("2026-07-08T00:00:00.000Z"); // 2 dias atrás — na carência
const longExpired = new Date("2026-07-01T00:00:00.000Z"); // 9 dias atrás — além da carência

async function makeTenantWithSub(status: "ACTIVE" | "PAST_DUE", periodEnd: Date): Promise<string> {
  const t = await prisma.tenant.create({
    data: {
      name: `Expiry ${suffix}`,
      slug: `expiry-${suffix}-${tenantIds.length}`,
      status: "ACTIVE",
    },
  });
  tenantIds.push(t.id);
  await prisma.subscription.create({
    data: { tenantId: t.id, planId, status, billingCycle: "MONTHLY", amountCents: 9990, currentPeriodEnd: periodEnd },
  });
  return t.id;
}

beforeAll(async () => {
  const plan = await prisma.plan.create({
    data: { name: `Expiry ${suffix}`, slug: `expiry-plan-${suffix}`, monthlyPrice: "99.90", features: { modules: ["wallet"] }, status: "ACTIVE" },
  });
  planId = plan.id;
});

afterAll(async () => {
  await prisma.subscription.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
  await prisma.plan.deleteMany({ where: { id: planId } });
  await prisma.$disconnect();
});

describe("runSubscriptionExpiry", () => {
  it("ACTIVE vencida vira PAST_DUE e MANTÉM o tenant ACTIVE (não corta na carência)", async () => {
    const tenantId = await makeTenantWithSub("ACTIVE", justExpired);
    await prisma.$transaction((tx) => runSubscriptionExpiry(tx, { now, graceDays: GRACE }));

    const sub = await prisma.subscription.findUnique({ where: { tenantId } });
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    expect(sub?.status).toBe("PAST_DUE");
    expect(tenant?.status).toBe("ACTIVE"); // acesso preservado na carência
  });

  it("ACTIVE no futuro não é tocada", async () => {
    const tenantId = await makeTenantWithSub("ACTIVE", inFuture);
    await prisma.$transaction((tx) => runSubscriptionExpiry(tx, { now, graceDays: GRACE }));

    const sub = await prisma.subscription.findUnique({ where: { tenantId } });
    expect(sub?.status).toBe("ACTIVE");
  });

  it("PAST_DUE além da carência vira SUSPENDED e SUSPENDE o tenant (corta login)", async () => {
    const tenantId = await makeTenantWithSub("PAST_DUE", longExpired);
    const result = await prisma.$transaction((tx) => runSubscriptionExpiry(tx, { now, graceDays: GRACE }));

    const sub = await prisma.subscription.findUnique({ where: { tenantId } });
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    expect(sub?.status).toBe("SUSPENDED");
    expect(tenant?.status).toBe("SUSPENDED");
    expect(result.suspendedTenantIds).toContain(tenantId);
  });

  it("PAST_DUE ainda DENTRO da carência não é suspensa", async () => {
    const tenantId = await makeTenantWithSub("PAST_DUE", justExpired);
    await prisma.$transaction((tx) => runSubscriptionExpiry(tx, { now, graceDays: GRACE }));

    const sub = await prisma.subscription.findUnique({ where: { tenantId } });
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    expect(sub?.status).toBe("PAST_DUE");
    expect(tenant?.status).toBe("ACTIVE");
  });
});
