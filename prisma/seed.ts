import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashSync } from "bcryptjs";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const BCRYPT_ROUNDS = 12;

async function main() {
  const superCpf = process.env.SUPERADMIN_CPF;
  const superPassword = process.env.SUPERADMIN_PASSWORD;

  if (!superCpf || !superPassword) {
    throw new Error("SUPERADMIN_CPF and SUPERADMIN_PASSWORD must be set in env");
  }

  // --- Tenants ---
  const tenantArena = await prisma.tenant.upsert({
    where: { slug: "arena-tech" },
    update: { name: "Arena Tech", status: "ACTIVE" },
    create: { slug: "arena-tech", name: "Arena Tech", status: "ACTIVE" },
  });
  console.log(`Tenant: ${tenantArena.name} (${tenantArena.id})`);

  const tenantTest = await prisma.tenant.upsert({
    where: { slug: "loja-teste" },
    update: { name: "Loja Teste", status: "ACTIVE" },
    create: { slug: "loja-teste", name: "Loja Teste", status: "ACTIVE" },
  });
  console.log(`Tenant: ${tenantTest.name} (${tenantTest.id})`);

  // --- Super Admin (no tenant link — accesses /admin directly) ---
  const superAdmin = await prisma.user.upsert({
    where: { cpf: superCpf },
    update: { name: "Super Admin", isSuperAdmin: true, passwordHash: hashSync(superPassword, BCRYPT_ROUNDS) },
    create: {
      cpf: superCpf,
      name: "Super Admin",
      email: "admin@arenatechpi.com.br",
      passwordHash: hashSync(superPassword, BCRYPT_ROUNDS),
      isSuperAdmin: true,
    },
  });
  console.log(`User: ${superAdmin.name} (${superAdmin.id}) [super admin, no tenant]`);

  // Remove any leftover tenant link for super admin (should have none)
  await prisma.userTenant.deleteMany({ where: { userId: superAdmin.id } });

  // --- Single-tenant operator (only arena-tech) ---
  const operadorCpf = process.env.OPERADOR_ARENA_CPF ?? "52998224725";
  const operadorPassword = process.env.OPERADOR_ARENA_PASSWORD ?? "Arena@2026";

  const operadorArena = await prisma.user.upsert({
    where: { cpf: operadorCpf },
    update: { name: "Operador Arena", passwordHash: hashSync(operadorPassword, BCRYPT_ROUNDS) },
    create: {
      cpf: operadorCpf,
      name: "Operador Arena",
      email: "operador@arenatechpi.com.br",
      passwordHash: hashSync(operadorPassword, BCRYPT_ROUNDS),
      isSuperAdmin: false,
    },
  });
  console.log(`User: ${operadorArena.name} (${operadorArena.id}) [single tenant]`);

  await prisma.userTenant.upsert({
    where: { userId_tenantId: { userId: operadorArena.id, tenantId: tenantArena.id } },
    update: { role: "operator" },
    create: { userId: operadorArena.id, tenantId: tenantArena.id, role: "operator" },
  });

  // --- Multi-tenant operator (arena-tech + loja-teste) ---
  const multiCpf = process.env.OPERADOR_MULTI_CPF ?? "11144477735";
  const multiPassword = process.env.OPERADOR_MULTI_PASSWORD ?? "Multi@2026";

  const operadorMulti = await prisma.user.upsert({
    where: { cpf: multiCpf },
    update: { name: "Operador Multi", passwordHash: hashSync(multiPassword, BCRYPT_ROUNDS) },
    create: {
      cpf: multiCpf,
      name: "Operador Multi",
      email: "multi@arenatechpi.com.br",
      passwordHash: hashSync(multiPassword, BCRYPT_ROUNDS),
      isSuperAdmin: false,
    },
  });
  console.log(`User: ${operadorMulti.name} (${operadorMulti.id}) [multi tenant]`);

  await prisma.userTenant.upsert({
    where: { userId_tenantId: { userId: operadorMulti.id, tenantId: tenantArena.id } },
    update: { role: "operator" },
    create: { userId: operadorMulti.id, tenantId: tenantArena.id, role: "operator" },
  });
  await prisma.userTenant.upsert({
    where: { userId_tenantId: { userId: operadorMulti.id, tenantId: tenantTest.id } },
    update: { role: "operator" },
    create: { userId: operadorMulti.id, tenantId: tenantTest.id, role: "operator" },
  });

  // --- No-access user (no tenants, not super admin) ---
  const noAccessCpf = process.env.NOACCESS_CPF ?? "98765432100";
  const noAccessPassword = process.env.NOACCESS_PASSWORD ?? "NoAccess@2026";

  const noAccessUser = await prisma.user.upsert({
    where: { cpf: noAccessCpf },
    update: { name: "Sem Acesso", passwordHash: hashSync(noAccessPassword, BCRYPT_ROUNDS) },
    create: {
      cpf: noAccessCpf,
      name: "Sem Acesso",
      passwordHash: hashSync(noAccessPassword, BCRYPT_ROUNDS),
      isSuperAdmin: false,
    },
  });
  console.log(`User: ${noAccessUser.name} (${noAccessUser.id}) [no tenants]`);

  // Ensure no tenant links
  await prisma.userTenant.deleteMany({ where: { userId: noAccessUser.id } });
}

main()
  .then(() => console.log("Seed complete."))
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
