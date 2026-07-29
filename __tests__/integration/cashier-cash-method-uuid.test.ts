/**
 * Finalização — Módulo 1 (Caixa), CX-1.
 *
 * "Dinheiro" só era reconhecido pelo literal `dinheiro`. O PDV manda
 * `PaymentMethod.code ?? PaymentMethod.id`, e em 5 dos 6 tenants com forma
 * "Dinheiro" cadastrada o `code` é NULL — ou seja, o que chega é o UUID.
 *
 * Com isso, para esses tenants, dinheiro que entra ou sai da gaveta não entra
 * na conta do saldo esperado: o fechamento acusa sobra/falta fantasma e a
 * guarda que impede despesa acima do saldo nunca dispara.
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
let cashMethodId: string;
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

  // Forma "Dinheiro" SEM code — exatamente o estado de produção dos tenants
  // NO-KYC. O PDV manda o id nesse caso.
  const created = await prisma.paymentMethod.create({
    data: {
      tenantId,
      name: "Dinheiro (teste CX-1)",
      type: "CASH",
      code: null,
      active: true,
    },
    select: { id: true },
  });
  cashMethodId = created.id;

  await prisma.cashSession.updateMany({
    where: { tenantId, userId: adminId, closedAt: null },
    data: { closedAt: new Date(), closeType: "MANUAL", calculatedBalance: new Prisma.Decimal(0) },
  });
});

afterAll(async () => {
  for (const id of sessionIds) await prisma.cashMovement.deleteMany({ where: { cashSessionId: id } });
  await prisma.cashSession.deleteMany({ where: { id: { in: sessionIds } } });
  await prisma.paymentMethod.deleteMany({ where: { id: cashMethodId } });
  await prisma.$disconnect();
});

describe("CX-1 — forma CASH cadastrada sem code (UUID) conta como dinheiro na gaveta", () => {
  it("despesa acima do saldo é bloqueada mesmo quando o método vem como UUID", async () => {
    const opened = await call(adminCtx).cashier.open({ initialBalance: 10_000 }); // R$ 100
    sessionIds.push(opened.id);

    await expect(
      call(adminCtx).cashier.expense({
        amount: 15_000, // R$ 150 > R$ 100 na gaveta
        paymentMethod: cashMethodId,
        description: "despesa em dinheiro pelo id da forma",
      }),
    ).rejects.toThrow(/excede o saldo da gaveta/i);
  });

  it("dinheiro que sai pelo UUID reduz o saldo esperado do fechamento", async () => {
    await call(adminCtx).cashier.expense({
      amount: 8_000, // R$ 80 de R$ 100
      paymentMethod: cashMethodId,
      description: "despesa em dinheiro pelo id da forma",
    });

    const summary = await call(adminCtx).cashier.closingSummary();
    expect(summary.summary.expectedCashBalance).toBe(2_000); // R$ 20 restantes
  });

  it("o movimento é gravado com um token canônico, não com o UUID cru", async () => {
    const movements = await prisma.cashMovement.findMany({
      where: { cashSessionId: sessionIds[0], type: "EXPENSE" },
      select: { paymentMethod: true, paymentMethodId: true },
    });
    expect(movements).toHaveLength(1);
    // O relatório e o resumo por forma usam `paymentMethod` como rótulo — com o
    // UUID cru a tela do fechamento mostra "a6b9e67e-…" no lugar de "Dinheiro".
    expect(movements[0]!.paymentMethod).toBe("dinheiro");
    // O vínculo com a forma cadastrada não se perde.
    expect(movements[0]!.paymentMethodId).toBe(cashMethodId);
  });
});
