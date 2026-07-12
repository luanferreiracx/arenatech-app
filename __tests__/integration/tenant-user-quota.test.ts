/**
 * Limite de usuários do plano (maxUsers) enforçado ao adicionar usuário ao tenant.
 *
 * Antes, `maxUsers` era só texto na UI — nada bloqueava. Prova que criar usuário
 * além do limite falha (FORBIDDEN), pelos DOIS caminhos (o helper compartilhado
 * `createTenantUserInTx` cobre self-service E superadmin).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createTenantUserInTx, assertTenantUserQuota } from "@/server/services/tenant-user.service";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const suffix = Date.now().toString(36);
let planId: string;
let tenantId: string;
const createdUserIds: string[] = [];

function cpf(n: number): string {
  return String(10000000000 + n).padStart(11, "0");
}

beforeAll(async () => {
  const plan = await prisma.plan.create({
    data: { name: `Quota ${suffix}`, slug: `quota-${suffix}`, monthlyPrice: "50.00", maxUsers: 2, features: { modules: ["wallet"] }, status: "ACTIVE" },
  });
  planId = plan.id;
  const tenant = await prisma.tenant.create({
    data: { name: `Quota ${suffix}`, slug: `quota-tenant-${suffix}`, status: "ACTIVE" },
  });
  tenantId = tenant.id;
  await prisma.subscription.create({
    data: { tenantId, planId, status: "ACTIVE", billingCycle: "MONTHLY", amountCents: 5000 },
  });
});

afterAll(async () => {
  await prisma.userTenant.deleteMany({ where: { tenantId } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await prisma.subscription.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.plan.deleteMany({ where: { id: planId } });
  await prisma.$disconnect();
});

describe("maxUsers do plano (=2) enforçado", () => {
  it("cria até o limite e bloqueia o excedente", async () => {
    // 1º usuário — ok (0 < 2).
    const u1 = await prisma.$transaction((tx) =>
      createTenantUserInTx(tx, { tenantId, name: "User 1", cpf: cpf(1), role: "admin" }),
    );
    createdUserIds.push(u1.user.id);

    // 2º usuário — ok (1 < 2).
    const u2 = await prisma.$transaction((tx) =>
      createTenantUserInTx(tx, { tenantId, name: "User 2", cpf: cpf(2), role: "operator" }),
    );
    createdUserIds.push(u2.user.id);

    // 3º usuário — bloqueado (2 >= 2).
    await expect(
      prisma.$transaction((tx) =>
        createTenantUserInTx(tx, { tenantId, name: "User 3", cpf: cpf(3), role: "operator" }),
      ),
    ).rejects.toThrow(/Limite de 2 usu/i);

    // Confirma que o 3º NÃO foi criado (rollback da transação).
    const count = await prisma.userTenant.count({ where: { tenantId } });
    expect(count).toBe(2);
  });

  it("assertTenantUserQuota lança quando já no limite", async () => {
    await expect(assertTenantUserQuota(prisma, tenantId)).rejects.toThrow(/Limite/i);
  });
});
