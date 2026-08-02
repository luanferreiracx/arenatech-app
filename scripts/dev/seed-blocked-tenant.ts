import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashSync } from "bcryptjs";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const EMAIL = "bloqueado@teste.local";
const PASSWORD = "Bloqueado@123";

async function main() {
  const plan = await prisma.plan.findFirstOrThrow({ where: { slug: "completo" } });
  const tenant = await prisma.tenant.upsert({
    where: { slug: "loja-bloqueada" },
    create: { name: "Loja Bloqueada", slug: "loja-bloqueada", status: "SUSPENDED", plan: plan.id },
    update: { status: "SUSPENDED", plan: plan.id },
  });
  const user = await prisma.user.upsert({
    where: { id: (await prisma.user.findFirst({ where: { email: EMAIL } }))?.id ?? "00000000-0000-0000-0000-000000000000" },
    create: { name: "Dono Bloqueado", email: EMAIL, passwordHash: hashSync(PASSWORD, 10), mustChangePassword: false },
    update: { passwordHash: hashSync(PASSWORD, 10) },
  });
  await prisma.userTenant.upsert({
    where: { userId_tenantId: { userId: user.id, tenantId: tenant.id } },
    create: { userId: user.id, tenantId: tenant.id, role: "admin" },
    update: { role: "admin" },
  });
  const periodEnd = new Date(Date.now() - 20 * 24 * 3600 * 1000);
  await prisma.subscription.upsert({
    where: { tenantId: tenant.id },
    create: { tenantId: tenant.id, planId: plan.id, status: "SUSPENDED", billingCycle: "MONTHLY", amountCents: 24900, currentPeriodEnd: periodEnd },
    update: { status: "SUSPENDED", currentPeriodEnd: periodEnd, planId: plan.id, amountCents: 24900 },
  });
  console.log("tenant", tenant.id, "user", user.id, "plano", plan.name);
  console.log("login:", EMAIL, PASSWORD);
}
main().finally(() => prisma.$disconnect());
