import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashSync } from "bcryptjs";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

async function make(slugPlan: string, slug: string, email: string) {
  const plan = await prisma.plan.findFirstOrThrow({ where: { slug: slugPlan } });
  const tenant = await prisma.tenant.upsert({
    where: { slug }, create: { name: slug, slug, status: "ACTIVE", plan: plan.id, cnpj: null },
    update: { status: "ACTIVE", plan: plan.id },
  });
  const found = await prisma.user.findFirst({ where: { email } });
  const user = found
    ? await prisma.user.update({ where: { id: found.id }, data: { passwordHash: hashSync("Teste@1234", 10) } })
    : await prisma.user.create({ data: { name: email, email, passwordHash: hashSync("Teste@1234", 10) } });
  await prisma.userTenant.upsert({
    where: { userId_tenantId: { userId: user.id, tenantId: tenant.id } },
    create: { userId: user.id, tenantId: tenant.id, role: "admin" }, update: { role: "admin" },
  });
  await prisma.subscription.upsert({
    where: { tenantId: tenant.id },
    create: { tenantId: tenant.id, planId: plan.id, status: "ACTIVE", billingCycle: "MONTHLY", amountCents: 14900, currentPeriodEnd: new Date(Date.now() + 30 * 864e5) },
    update: { planId: plan.id, status: "ACTIVE", currentPeriodEnd: new Date(Date.now() + 30 * 864e5) },
  });
  console.log(`${slugPlan.padEnd(14)} -> ${email} / Teste@1234`);
}
async function main() {
  await make("assistencia", "loja-assistencia", "assistencia@teste.local");
  await make("varejo", "loja-varejo", "varejo@teste.local");
}
main().finally(() => prisma.$disconnect());
