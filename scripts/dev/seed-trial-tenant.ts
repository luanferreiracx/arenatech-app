import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashSync } from "bcryptjs";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const EMAIL = "trial@teste.local";
const PASSWORD = "Trial@1234";

async function main() {
  const plan = await prisma.plan.findFirstOrThrow({ where: { slug: "completo" } });
  const tenant = await prisma.tenant.upsert({
    where: { slug: "loja-trial" },
    create: { name: "Loja em Teste", slug: "loja-trial", status: "ACTIVE", plan: plan.id },
    update: { status: "ACTIVE", plan: plan.id },
  });
  const existing = await prisma.user.findFirst({ where: { email: EMAIL } });
  const user = existing
    ? await prisma.user.update({ where: { id: existing.id }, data: { passwordHash: hashSync(PASSWORD, 10) } })
    : await prisma.user.create({
        data: { name: "Dono Trial", email: EMAIL, passwordHash: hashSync(PASSWORD, 10), mustChangePassword: false },
      });
  await prisma.userTenant.upsert({
    where: { userId_tenantId: { userId: user.id, tenantId: tenant.id } },
    create: { userId: user.id, tenantId: tenant.id, role: "admin" },
    update: { role: "admin" },
  });
  const trialEnd = new Date(Date.now() + 7 * 24 * 3600 * 1000);
  await prisma.subscription.upsert({
    where: { tenantId: tenant.id },
    create: { tenantId: tenant.id, planId: plan.id, status: "TRIALING", billingCycle: "MONTHLY", amountCents: 24900, currentPeriodEnd: trialEnd },
    update: { status: "TRIALING", currentPeriodEnd: trialEnd, planId: plan.id, amountCents: 24900 },
  });
  console.log("tenant", tenant.id, "| login:", EMAIL, PASSWORD, "| trial ate", trialEnd.toISOString());
}
main().finally(() => prisma.$disconnect());
