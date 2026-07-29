/**
 * Finalização — Módulo 1 (Caixa), CX-6.
 *
 * A conferência do gerente gravava a contagem dele por cima de
 * `declaredBalance`, que é o que o OPERADOR declarou no fechamento. O registro
 * de "o operador disse R$ 500 e o gerente achou R$ 450" virava só R$ 450 —
 * sumia justamente a evidência que dá sentido à conferência.
 *
 * E o guard `session.verified` lia antes de escrever, sem CAS: duas
 * conferências concorrentes passavam as duas.
 *
 * Estes testes FALHAM antes da correção.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
vi.mock("@/server/auth", () => ({ auth: async () => null }));
import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createCallerFactory } from "@/server/api/trpc";
import { appRouter } from "@/server/api/root";
import { withTenant } from "@/server/db";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

let tenantId: string;
let adminId: string;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let adminCtx: any;
const sessionIds: string[] = [];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const call = (c: any) => createCallerFactory(appRouter)(c);

beforeAll(async () => {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "arena-tech" } });
  const admin = await prisma.user.findFirstOrThrow({ where: { name: "Admin Arena" } });
  tenantId = tenant.id;
  adminId = admin.id;
  adminCtx = {
    session: {
      user: { id: adminId, isSuperAdmin: false },
      activeTenantId: tenantId,
      availableTenants: [{ id: tenantId, slug: "arena-tech", role: "admin" }],
    },
    tenantId,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    withTenant: (fn: any) => withTenant(tenantId, fn),
  };
  await prisma.cashSession.updateMany({
    where: { tenantId, userId: adminId, closedAt: null },
    data: { closedAt: new Date(), closeType: "MANUAL", calculatedBalance: new Prisma.Decimal(0) },
  });
});

afterAll(async () => {
  for (const id of sessionIds) await prisma.cashMovement.deleteMany({ where: { cashSessionId: id } });
  await prisma.cashSession.deleteMany({ where: { id: { in: sessionIds } } });
  await prisma.$disconnect();
});

/** Abre um caixa com R$ 100 e fecha declarando `declaredCents`. */
async function openAndClose(declaredCents: number, note: string): Promise<string> {
  const opened = await call(adminCtx).cashier.open({ initialBalance: 10_000 });
  sessionIds.push(opened.id);
  await call(adminCtx).cashier.close({ declaredBalance: declaredCents, closingNote: note });
  return opened.id;
}

describe("CX-6 — a conferência não apaga o que o operador declarou", () => {
  it("preserva o declarado do operador e guarda a contagem do gerente à parte", async () => {
    // Operador declarou R$ 90 numa gaveta que o sistema esperava com R$ 100.
    const id = await openAndClose(9_000, "faltou dez reais");

    const afterClose = await prisma.cashSession.findUniqueOrThrow({ where: { id } });
    expect(Number(afterClose.declaredBalance)).toBe(90);
    expect(Number(afterClose.difference)).toBe(-10);

    // Gerente confere e conta R$ 85.
    await call(adminCtx).cashier.review({ cashSessionId: id, reportedBalance: 8_500 });

    const afterReview = await prisma.cashSession.findUniqueOrThrow({ where: { id } });
    expect(Number(afterReview.declaredBalance)).toBe(90); // do operador, intacto
    expect(Number(afterReview.difference)).toBe(-10); // divergência do fechamento
    expect(Number(afterReview.reviewedBalance)).toBe(85); // do gerente
    expect(Number(afterReview.reviewDifference)).toBe(-15); // 85 − 100
    expect(afterReview.verified).toBe(true);
  });

  it("recusa a segunda conferência concorrente em vez de sobrescrever a primeira", async () => {
    const id = await openAndClose(10_000, "");

    const [first, second] = await Promise.allSettled([
      call(adminCtx).cashier.review({ cashSessionId: id, reportedBalance: 10_000 }),
      call(adminCtx).cashier.review({ cashSessionId: id, reportedBalance: 5_000 }),
    ]);

    const outcomes = [first.status, second.status].sort();
    expect(outcomes).toEqual(["fulfilled", "rejected"]);

    // A contagem que valeu é a da conferência vencedora — nunca uma mistura.
    const row = await prisma.cashSession.findUniqueOrThrow({ where: { id } });
    const winner = first.status === "fulfilled" ? 100 : 50;
    expect(Number(row.reviewedBalance)).toBe(winner);
  });
});
