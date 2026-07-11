/**
 * Auditoria Interesses — PR3 envio em lote (ao vivo).
 * B5: cooldown anti-spam — interesse notificado há <24h é PULADO no lote
 *     (skipped), não reenviado.
 * B1: sendBatch é admin-only (operador não dispara WhatsApp em massa).
 * O whatsapp-service roda em mock (sem credenciais) → success sem HTTP real.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
vi.mock("@/server/auth", () => ({ auth: async () => null }));
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createCallerFactory } from "@/server/api/trpc";
import { appRouter } from "@/server/api/root";
import { withTenant } from "@/server/db";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const MARK = "interest-batch-test";
let tenantId: string, adminId: string, operatorId: string, adminCtx: any, operatorCtx: any;
const ids: string[] = [];
const msgIds: string[] = [];

const call = (c: any) => createCallerFactory(appRouter)(c);
function mkCtx(userId: string, role: string) {
  return { session: { user: { id: userId, isSuperAdmin: false }, activeTenantId: tenantId, availableTenants: [{ id: tenantId, slug: "arena-tech", role }] }, tenantId, withTenant: (fn: any) => withTenant(tenantId, fn) };
}

beforeAll(async () => {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "arena-tech" } });
  const admin = await prisma.user.findFirstOrThrow({ where: { name: "Admin Arena" } });
  const operator = await prisma.user.findFirstOrThrow({ where: { name: "Operador Arena" } });
  tenantId = tenant.id; adminId = admin.id; operatorId = operator.id;
  adminCtx = mkCtx(adminId, "admin"); operatorCtx = mkCtx(operatorId, "operator");
});

afterAll(async () => {
  await prisma.message.deleteMany({ where: { referenceType: "interest", referenceId: { in: ids } } });
  await prisma.interestInteraction.deleteMany({ where: { interestId: { in: ids } } });
  await prisma.interest.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});

async function makeInterest(phone: string) {
  const i = await call(adminCtx).interest.create({
    customerName: `${MARK}-${Math.random()}`,
    phone,
    type: "PURCHASE",
    desiredModel: `${MARK}-modelo`,
  });
  ids.push(i.id);
  return i;
}

describe("Auditoria Interesses — PR3 envio em lote (ao vivo)", () => {
  it("B1: operador NÃO dispara sendBatch (admin-only)", async () => {
    const i = await makeInterest("11944440001");
    await expect(
      call(operatorCtx).interest.sendBatch({ ids: [i.id], message: "Olá, temos novidades!" }),
    ).rejects.toThrow(/administradores/i);
  });

  it("B5: 1º envio manda; 2º envio imediato é PULADO por cooldown", async () => {
    const i = await makeInterest("11944440002");

    const first = await call(adminCtx).interest.sendBatch({ ids: [i.id], message: "Primeira mensagem de teste" });
    expect(first.sent).toBe(1);
    expect(first.skipped).toBe(0);

    // lastNotifiedAt foi gravado no 1º envio; o 2º cai no cooldown.
    const afterFirst = await prisma.interest.findUniqueOrThrow({ where: { id: i.id } });
    expect(afterFirst.lastNotifiedAt).not.toBeNull();

    const second = await call(adminCtx).interest.sendBatch({ ids: [i.id], message: "Segunda mensagem de teste" });
    expect(second.sent).toBe(0);
    expect(second.skipped).toBe(1);
  });

  it("B5: interesse notificado há >24h NÃO é pulado", async () => {
    const i = await makeInterest("11944440003");
    // força lastNotifiedAt para 25h atrás (fora do cooldown).
    await prisma.interest.update({
      where: { id: i.id },
      data: { lastNotifiedAt: new Date(Date.now() - 25 * 60 * 60 * 1000) },
    });
    const res = await call(adminCtx).interest.sendBatch({ ids: [i.id], message: "Reativação após 24h" });
    expect(res.sent).toBe(1);
    expect(res.skipped).toBe(0);
  });
});
