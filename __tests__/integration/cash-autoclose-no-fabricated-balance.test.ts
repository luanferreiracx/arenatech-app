/**
 * Auditoria 2026-07-25 — `autoCloseAbandonedSessions` (cron) fabricava o saldo
 * contado e não tinha CAS.
 *
 * A correção CX-forceClose-B3 (PR #513) tirou a fabricação do `forceClose`, mas
 * nunca chegou ao cron:
 *
 * 1. Gravava `declaredBalance = calculatedBalance` e `difference = 0`. Uma
 *    sessão fechada pelo cron NUNCA aparecia como divergente (pendingReviews e
 *    periodStats somam `difference`), então uma falta real de gaveta sumia do
 *    relatório — o gerente conferia vendo "R$ 0,00" que ninguém contou.
 * 2. `update` cego, sem guarda `closedAt: null`: se o operador fechasse
 *    manualmente no intervalo entre o `findMany` e o `update`, o cron
 *    SOBRESCREVIA o fechamento real com os valores fabricados.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
vi.mock("@/server/auth", () => ({ auth: async () => null }));
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { autoCloseAbandonedSessions } from "@/server/services/cash-session.service";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const MARK = "autoclose";
let tenantId: string, userId: string;
const sessionIds: string[] = [];

beforeAll(async () => {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "arena-tech" } });
  const admin = await prisma.user.findFirstOrThrow({ where: { name: "Admin Arena" } });
  tenantId = tenant.id;
  userId = admin.id;
});

afterAll(async () => {
  await prisma.cashMovement.deleteMany({ where: { cashSessionId: { in: sessionIds } } });
  await prisma.cashSession.deleteMany({ where: { id: { in: sessionIds } } });
  await prisma.$disconnect();
});

/** Sessão aberta há 30h (acima do corte de 18h), com R$500 de venda em dinheiro. */
async function makeAbandonedSession() {
  const openedAt = new Date(Date.now() - 30 * 60 * 60 * 1000);
  const s = await prisma.cashSession.create({
    data: { tenantId, userId, initialBalance: 100, openedAt },
  });
  sessionIds.push(s.id);
  await prisma.cashMovement.create({
    data: {
      tenantId,
      cashSessionId: s.id,
      type: "SALE",
      nature: "INCOME",
      amount: 500,
      paymentMethod: "dinheiro",
      description: `${MARK}-venda`,
      createdByUserId: userId,
    },
  });
  return s.id;
}

describe("autoCloseAbandonedSessions — não fabrica saldo contado, e não atropela fechamento manual", () => {
  it("fecha a sessão abandonada SEM inventar declaredBalance/difference", async () => {
    const id = await makeAbandonedSession();

    await autoCloseAbandonedSessions(prisma as never, 18);

    const closed = await prisma.cashSession.findUniqueOrThrow({ where: { id } });
    expect(closed.closedAt).not.toBeNull();
    expect(closed.closeType).toBe("AUTOMATIC");
    // O calculado é real (R$100 inicial + R$500 em dinheiro).
    expect(Number(closed.calculatedBalance)).toBe(600);
    // O CONTADO não existe: ninguém contou a gaveta física.
    expect(closed.declaredBalance).toBeNull();
    expect(closed.difference).toBeNull();
  });

  it("NÃO sobrescreve fechamento manual que aconteceu DEPOIS da leitura do cron (CAS)", async () => {
    const id = await makeAbandonedSession();

    // Reproduz a janela real: o cron lê a sessão AINDA ABERTA e, entre a
    // leitura e a escrita, o operador fecha manualmente contando R$ 550
    // (faltam R$ 50 na gaveta). Sem o CAS `closedAt: null`, o `update` cego do
    // cron sobrescrevia esse fechamento com os valores fabricados — a falta
    // real de R$ 50 virava "R$ 0,00 conferido".
    const manualClosedAt = new Date();
    const originalFindMany = prisma.cashSession.findMany.bind(prisma.cashSession);
    const spy = vi
      .spyOn(prisma.cashSession, "findMany")
      .mockImplementationOnce(((async (args: unknown) => {
        const rows = await originalFindMany(args as never);
        // ...operador fecha AGORA, depois de o cron já ter lido:
        await prisma.cashSession.update({
          where: { id },
          data: {
            calculatedBalance: 600,
            declaredBalance: 550,
            difference: -50,
            closeType: "MANUAL",
            closedAt: manualClosedAt,
          },
        });
        return rows;
      }) as unknown) as typeof prisma.cashSession.findMany);

    try {
      await autoCloseAbandonedSessions(prisma as never, 18);
    } finally {
      spy.mockRestore();
    }

    const after = await prisma.cashSession.findUniqueOrThrow({ where: { id } });
    expect(after.closeType).toBe("MANUAL");
    expect(Number(after.declaredBalance)).toBe(550);
    expect(Number(after.difference)).toBe(-50); // a falta REAL continua visível
    expect(after.closedAt?.getTime()).toBe(manualClosedAt.getTime());
  });
});
