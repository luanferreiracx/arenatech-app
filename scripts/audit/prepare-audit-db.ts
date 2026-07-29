/**
 * Prepara a CÓPIA LOCAL do banco de produção para a auditoria de finalização.
 *
 * A passada de frontend precisa navegar o sistema com dados reais, como ADMIN e
 * como OPERADOR. Os usuários de produção têm hash de senha que ninguém conhece,
 * então este script injeta dois usuários de auditoria com senha conhecida na
 * cópia local — as MESMAS credenciais do seed de E2E, para o harness reaproveitar
 * os helpers de login que já existem.
 *
 * NUNCA roda contra produção: aborta se o host do DATABASE_URL não for local.
 *
 * Uso:
 *   DATABASE_URL="postgresql://arenatech:arenatech_local@localhost:5432/arenatech_prod" \
 *     pnpm tsx scripts/audit/prepare-audit-db.ts
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashSync } from "bcryptjs";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);

/** Tenant onde os usuários de auditoria entram (acesso total, sem gating de plano). */
const AUDIT_TENANT_SLUG = "arena-tech";

/**
 * Credenciais espelham `prisma/seed.ts` para o harness usar o mesmo login em
 * qualquer base (seed limpo ou cópia de produção).
 */
const AUDIT_USERS = [
  {
    cpf: "86288366757",
    name: "Auditoria Admin",
    email: "auditoria.admin@local.invalid",
    password: "Admin@2026",
    role: "admin",
  },
  {
    cpf: "52998224725",
    name: "Auditoria Operador",
    email: "auditoria.operador@local.invalid",
    password: "Arena@2026",
    role: "operator",
  },
] as const;

function assertLocalDatabase(url: string): void {
  const host = new URL(url).hostname;
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      `Recusado: DATABASE_URL aponta para "${host}". Este script só roda em banco local.`,
    );
  }
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL não definida.");
assertLocalDatabase(databaseUrl);

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

async function upsertUserByCpf(cpf: string, data: Omit<Prisma.UserUncheckedCreateInput, "cpf">) {
  const existing = await prisma.user.findFirst({ where: { cpf }, select: { id: true } });
  if (existing) return prisma.user.update({ where: { id: existing.id }, data });
  return prisma.user.create({ data: { ...data, cpf } });
}

async function main(): Promise<void> {
  const tenant = await prisma.tenant.findUnique({
    where: { slug: AUDIT_TENANT_SLUG },
    select: { id: true, name: true },
  });
  if (!tenant) throw new Error(`Tenant "${AUDIT_TENANT_SLUG}" não existe nesta base.`);

  for (const spec of AUDIT_USERS) {
    const user = await upsertUserByCpf(spec.cpf, {
      name: spec.name,
      email: spec.email,
      passwordHash: hashSync(spec.password, 12),
      isSuperAdmin: false,
      mustChangePassword: false,
      twoFactorEnabled: false,
      twoFactorSecret: null,
      twoFactorConfirmedAt: null,
      twoFactorBackupCodes: [],
    });
    await prisma.userTenant.upsert({
      where: { userId_tenantId: { userId: user.id, tenantId: tenant.id } },
      update: { role: spec.role, isCashier: true, isTechnician: spec.role === "admin" },
      create: {
        userId: user.id,
        tenantId: tenant.id,
        role: spec.role,
        isCashier: true,
        isTechnician: spec.role === "admin",
      },
    });
    console.log(`${spec.role.padEnd(8)} ${spec.cpf}  ${spec.name}`);
  }

  console.log(`\nTenant de auditoria: ${tenant.name} (${tenant.id})`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
