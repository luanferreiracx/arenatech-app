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

// appRouter puxa NextAuth (next/server) — mock igual aos demais caller-tests.
vi.mock("@/server/auth", () => ({ auth: async () => null }));

import { createCallerFactory } from "@/server/api/trpc";
import { appRouter } from "@/server/api/root";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

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
    data: { tenantId, planId, status: "ACTIVE", billingCycle: "MONTHLY", amountCents: 5000 },
  });
});

afterAll(async () => {
  await prisma.subscription.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.plan.deleteMany({ where: { id: planId } });
  await prisma.$disconnect();
});

describe("deleteTenant", () => {
  it("cancela o tenant E a assinatura juntos", async () => {
    await adminCall().admin.deleteTenant({ id: tenantId });

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    const sub = await prisma.subscription.findUnique({ where: { tenantId } });
    expect(tenant?.status).toBe("CANCELLED");
    expect(sub?.status).toBe("CANCELLED");
    expect(sub?.cancelReason).toBe("Tenant cancelado");
  });
});
