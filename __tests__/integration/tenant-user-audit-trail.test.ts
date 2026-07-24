/**
 * A6 — gestão de equipe gera trilha de auditoria persistente (audit_logs).
 *
 * Antes, criar/atualizar/remover/reset de usuário de tenant só emitia
 * `logger.info` (transiente) — invisível na aba Logs e pós-incidente não dava
 * pra rastrear quem deu/alterou/revogou acesso. Agora cada operação grava em
 * audit_logs (entity=tenant_user) com o ator.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  createTenantUserInTx,
  updateTenantUserInTx,
  removeTenantUserInTx,
  resetTenantUserPasswordInTx,
  resetTenantUserTwoFactorInTx,
} from "@/server/services/tenant-user.service";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const suffix = Date.now().toString(36);
const ACTOR = "00000000-0000-0000-0000-0000000000ab";
let tenantId: string;
const createdUserIds: string[] = [];

const cpf = (n: number) => String(20000000000 + n).padStart(11, "0");

beforeAll(async () => {
  const tenant = await prisma.tenant.create({
    data: { name: `Audit ${suffix}`, slug: `audit-team-${suffix}`, status: "ACTIVE" },
  });
  tenantId = tenant.id;
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { tenantId } });
  await prisma.userTenant.deleteMany({ where: { tenantId } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.$disconnect();
});

async function auditFor(userId: string, action: string) {
  return prisma.auditLog.findFirst({
    where: { tenantId, entity: "tenant_user", entityId: userId, action },
    orderBy: { createdAt: "desc" },
  });
}

describe("A6 — trilha de auditoria da gestão de equipe", () => {
  it("create → updated → reset_password → reset_two_factor → removed geram audit_logs com o ator", async () => {
    // create (admin, para poder rebaixar depois há de existir outro admin)
    const other = await prisma.$transaction((tx) =>
      createTenantUserInTx(tx, { tenantId, actorUserId: ACTOR, name: "Admin Base", cpf: cpf(1), role: "admin" }),
    );
    createdUserIds.push(other.user.id);

    const created = await prisma.$transaction((tx) =>
      createTenantUserInTx(tx, { tenantId, actorUserId: ACTOR, name: "Membro", cpf: cpf(2), role: "operator" }),
    );
    createdUserIds.push(created.user.id);
    const uid = created.user.id;

    const createdLog = await auditFor(uid, "created");
    expect(createdLog).toBeTruthy();
    expect(createdLog!.userId).toBe(ACTOR);
    expect((createdLog!.payload as any).role).toBe("operator");

    // update (muda papel)
    await prisma.$transaction((tx) =>
      updateTenantUserInTx(tx, { tenantId, actorUserId: ACTOR, userId: uid, name: "Membro", role: "admin" }),
    );
    const updatedLog = await auditFor(uid, "updated");
    expect(updatedLog).toBeTruthy();
    expect((updatedLog!.payload as any).roleBefore).toBe("operator");
    expect((updatedLog!.payload as any).roleAfter).toBe("admin");

    // reset password
    await prisma.$transaction((tx) => resetTenantUserPasswordInTx(tx, tenantId, uid, ACTOR));
    expect(await auditFor(uid, "reset_password")).toBeTruthy();

    // reset 2FA
    await prisma.$transaction((tx) => resetTenantUserTwoFactorInTx(tx, tenantId, uid, ACTOR));
    expect(await auditFor(uid, "reset_two_factor")).toBeTruthy();

    // remove (uid é admin agora, mas 'other' também é admin → pode remover)
    await prisma.$transaction((tx) => removeTenantUserInTx(tx, tenantId, uid, ACTOR));
    const removedLog = await auditFor(uid, "removed");
    expect(removedLog).toBeTruthy();
    expect(removedLog!.userId).toBe(ACTOR);
  });
});
