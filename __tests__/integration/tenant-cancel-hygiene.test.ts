/**
 * Higiene do cancelamento de tenant (deleteTenant).
 *
 * Antes, cancelar o tenant só mudava Tenant.status; a Subscription seguia ACTIVE
 * (billing "cobrando" um tenant morto). Prova que deleteTenant leva o tenant a
 * CANCELLED E cancela a assinatura, numa transação.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { nextPeriodEnd } from "@/lib/billing/subscription";

// appRouter puxa NextAuth (next/server) — mock igual aos demais caller-tests.
vi.mock("@/server/auth", () => ({ auth: async () => null }));

import { createCallerFactory } from "@/server/api/trpc";
import { appRouter } from "@/server/api/root";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// Vencimento obrigatório desde o ADR 0061. Usa o MESMO cálculo da produção em
// vez de uma data inventada: se `nextPeriodEnd` mudar, o fixture acompanha.
const nextMonth = () => nextPeriodEnd({ cycle: "MONTHLY", currentPeriodEnd: null, now: new Date() });

const suffix = Date.now().toString(36);
let planId: string;
let tenantId: string;
let superAdminId: string;

// adminProcedure só exige session.user.isSuperAdmin; injeta withAdmin sozinho.
const adminCall = () =>
  createCallerFactory(appRouter)({
    session: { user: { id: superAdminId, isSuperAdmin: true } },
  } as never);

beforeAll(async () => {
  const su = await prisma.user.findFirstOrThrow({ where: { isSuperAdmin: true } });
  superAdminId = su.id;
  const plan = await prisma.plan.create({
    data: { name: `Cancel ${suffix}`, slug: `cancel-${suffix}`, monthlyPrice: "50.00", features: { modules: ["wallet"] }, status: "ACTIVE" },
  });
  planId = plan.id;
  const tenant = await prisma.tenant.create({
    data: { name: `Cancel ${suffix}`, slug: `cancel-tenant-${suffix}`, status: "ACTIVE" },
  });
  tenantId = tenant.id;
  await prisma.subscription.create({
    data: { tenantId, planId, status: "ACTIVE", billingCycle: "MONTHLY", amountCents: 5000, currentPeriodEnd: nextMonth() },
  });
});

afterAll(async () => {
  await prisma.subscription.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.plan.deleteMany({ where: { id: planId } });
  await prisma.$disconnect();
});

/** Cria uma API-key viva para o tenant e devolve o id. */
async function makeLiveKey(): Promise<string> {
  const key = await prisma.partnerApiKey.create({
    data: {
      tenantId,
      name: `key-${suffix}-${Math.floor(process.hrtime()[1] % 100000)}`,
      keyPrefix: `pk_${suffix}${process.hrtime()[1] % 100000}`,
      keyHash: "$2a$10$abcdefghijklmnopqrstuv",
      scopes: ["depix:read"],
      createdById: superAdminId,
    },
  });
  return key.id;
}

// ADR 0061 — suspender (atraso) e cancelar (saída) deixaram de ser a mesma coisa
// para a API de parceiros. Quem libera a API é o toggle `apiAccessEnabled` do
// superadmin: atrasar a mensalidade não pode desligar a integração pelas costas
// de quem a ligou. Cancelar, sim — tenant cancelado não volta, e uma key viva
// sacaria DePix on-chain, que é irreversível.
describe("suspendSubscription — atraso não revoga API-key", () => {
  it("suspender preserva as keys vivas", async () => {
    const keyId = await makeLiveKey();
    await adminCall().admin.suspendSubscription({ tenantId, cancel: false, reason: "teste" });

    const key = await prisma.partnerApiKey.findUnique({ where: { id: keyId } });
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    expect(key?.revokedAt).toBeNull();
    expect(tenant?.status).toBe("SUSPENDED");
  });

  it("cancelar revoga as keys vivas", async () => {
    await prisma.tenant.update({ where: { id: tenantId }, data: { status: "ACTIVE" } });
    await prisma.subscription.update({ where: { tenantId }, data: { status: "ACTIVE" } });
    const keyId = await makeLiveKey();

    await adminCall().admin.suspendSubscription({ tenantId, cancel: true, reason: "saiu" });

    const key = await prisma.partnerApiKey.findUnique({ where: { id: keyId } });
    expect(key?.revokedAt).toBeInstanceOf(Date);
  });
});

describe("deleteTenant", () => {
  it("cancela o tenant E a assinatura juntos", async () => {
    // Os testes acima deixaram a assinatura CANCELLED; volta ao estado inicial.
    await prisma.tenant.update({ where: { id: tenantId }, data: { status: "ACTIVE" } });
    await prisma.subscription.update({
      where: { tenantId },
      data: { status: "ACTIVE", cancelReason: null },
    });

    await adminCall().admin.deleteTenant({ id: tenantId });

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    const sub = await prisma.subscription.findUnique({ where: { tenantId } });
    expect(tenant?.status).toBe("CANCELLED");
    expect(sub?.status).toBe("CANCELLED");
    expect(sub?.cancelReason).toBe("Tenant cancelado");
  });
});
