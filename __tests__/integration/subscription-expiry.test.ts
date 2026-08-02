/**
 * Vencimento de assinatura (cron expire-subscriptions) contra o banco real.
 *
 * Prova as duas transições: ACTIVE vencida → PAST_DUE (mantém acesso); PAST_DUE
 * além da carência → SUSPENDED + Tenant SUSPENDED. E que assinatura no futuro /
 * dentro da carência NÃO é tocada.
 *
 * Desde o ADR 0061 suspender NÃO corta o login: prova também que o estado final
 * ainda rende sessão (o cliente entra e paga), com os módulos no piso.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { runSubscriptionExpiry } from "@/server/services/subscription-expiry.service";
import { keepsSession, isBlockedStatus } from "@/lib/auth/tenant-status";
import {
  allowedModulesForTenant,
  ALWAYS_ON_MODULES,
  WALLET_FLOOR_MODULES,
} from "@/lib/modules";

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

  it("PAST_DUE além da carência vira SUSPENDED e SUSPENDE o tenant", async () => {
    const tenantId = await makeTenantWithSub("PAST_DUE", longExpired);
    const result = await prisma.$transaction((tx) => runSubscriptionExpiry(tx, { now, graceDays: GRACE }));

    const sub = await prisma.subscription.findUnique({ where: { tenantId } });
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    expect(sub?.status).toBe("SUSPENDED");
    expect(tenant?.status).toBe("SUSPENDED");
    expect(result.suspendedTenantIds).toContain(tenantId);
  });
});

// ── ADR 0061 — o suspenso não é expulso ──
//
// O defeito que isto guarda: o suspenso sumia de `availableTenants`, o proxy o
// mandava para `/no-access` ("sua conta não está vinculada a nenhuma loja") e a
// tela de pagar, sendo rota de tenant, ficava inalcançável. Ele ficava trancado
// do lado de fora, sem caminho de volta, e só o superadmin destravava.
describe("estado pós-suspensão: bloqueio, não expulsão", () => {
  it("o tenant suspenso ainda rende sessão e é marcado como bloqueado", async () => {
    const tenantId = await makeTenantWithSub("PAST_DUE", longExpired);
    await prisma.$transaction((tx) => runSubscriptionExpiry(tx, { now, graceDays: GRACE }));

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    expect(keepsSession(tenant!.status)).toBe(true);
    expect(isBlockedStatus(tenant!.status)).toBe(true);
  });

  it("os módulos do tenant suspenso caem no piso, com a carteira de pé", async () => {
    // O tenant do caso é um cliente que OPERA DePix — é dele que a invariante
    // fala. Desde o gate `depixEnabled` (ADR 0062), quem nunca habilitou DePix
    // não tem carteira para preservar; quem habilitou não pode perdê-la por
    // dever mensalidade, que é o beco sem saída que o ADR 0061 fechou.
    const tenantId = await makeTenantWithSub("PAST_DUE", longExpired);
    await prisma.tenant.update({ where: { id: tenantId }, data: { depixEnabled: true } });
    await prisma.$transaction((tx) => runSubscriptionExpiry(tx, { now, graceDays: GRACE }));

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    const plan = await prisma.plan.findUnique({ where: { id: planId } });
    const modules = allowedModulesForTenant({
      tenantSlug: tenant!.slug,
      planFeatures: plan!.features,
      hasPlan: true,
      blocked: isBlockedStatus(tenant!.status),
      depixEnabled: tenant!.depixEnabled,
    });

    expect([...modules].sort()).toEqual(
      [...ALWAYS_ON_MODULES, ...WALLET_FLOOR_MODULES].sort(),
    );
    expect(modules).toContain("wallet");
  });

  it("suspenso SEM DePix habilitado não ganha carteira por causa do bloqueio", async () => {
    // O contrapeso: o bloqueio suave preserva o piso, não concede módulo novo.
    const tenantId = await makeTenantWithSub("PAST_DUE", longExpired);
    await prisma.$transaction((tx) => runSubscriptionExpiry(tx, { now, graceDays: GRACE }));

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    const plan = await prisma.plan.findUnique({ where: { id: planId } });
    const modules = allowedModulesForTenant({
      tenantSlug: tenant!.slug,
      planFeatures: plan!.features,
      hasPlan: true,
      blocked: isBlockedStatus(tenant!.status),
      depixEnabled: tenant!.depixEnabled,
    });

    expect(modules).not.toContain("wallet");
    expect([...modules].sort()).toEqual([...ALWAYS_ON_MODULES].sort());
  });

  it("a assinatura suspensa deixa de conceder plano, mas a linha continua lá pra pagar", async () => {
    const tenantId = await makeTenantWithSub("PAST_DUE", longExpired);
    await prisma.$transaction((tx) => runSubscriptionExpiry(tx, { now, graceDays: GRACE }));

    const sub = await prisma.subscription.findUnique({ where: { tenantId } });
    expect(sub).not.toBeNull();
    expect(sub!.amountCents).toBeGreaterThan(0);
    expect(sub!.currentPeriodEnd).toBeInstanceOf(Date);
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
