import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashSync } from "bcryptjs";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const cpf = process.env.SUPERADMIN_CPF;
  const password = process.env.SUPERADMIN_PASSWORD;

  if (!cpf || !password) {
    throw new Error("SUPERADMIN_CPF and SUPERADMIN_PASSWORD must be set in env");
  }

  // 1. Upsert tenant "Arena Tech"
  const tenant = await prisma.tenant.upsert({
    where: { slug: "arena-tech" },
    update: { name: "Arena Tech", status: "ACTIVE" },
    create: {
      slug: "arena-tech",
      name: "Arena Tech",
      status: "ACTIVE",
    },
  });
  console.log(`Tenant: ${tenant.name} (${tenant.id})`);

  // 2. Upsert super admin user
  const passwordHash = hashSync(password, 12);
  const user = await prisma.user.upsert({
    where: { cpf },
    update: { name: "Super Admin", isSuperAdmin: true, passwordHash },
    create: {
      cpf,
      name: "Super Admin",
      email: "admin@arenatechpi.com.br",
      passwordHash,
      isSuperAdmin: true,
    },
  });
  console.log(`User: ${user.name} (${user.id})`);

  // 3. Upsert UserTenant link (owner role)
  await prisma.userTenant.upsert({
    where: { userId_tenantId: { userId: user.id, tenantId: tenant.id } },
    update: { role: "owner" },
    create: {
      userId: user.id,
      tenantId: tenant.id,
      role: "owner",
    },
  });
  console.log(`Link: ${user.name} → ${tenant.name} (owner)`);
}

main()
  .then(() => {
    console.log("Seed complete.");
  })
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
