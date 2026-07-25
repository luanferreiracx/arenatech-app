/**
 * C6 — despesas recorrentes: o service gera a FinancialTransaction do mês a partir
 * do template (idempotente); tRPC faz o CRUD (admin).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
vi.mock("@/server/auth", () => ({ auth: async () => null }));
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createCallerFactory } from "@/server/api/trpc";
import { appRouter } from "@/server/api/root";
import { withTenant } from "@/server/db";
import { generateDueRecurringExpenses } from "@/server/services/recurring-expense.service";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const MARK = `recur-${Date.now().toString(36)}`;
let tenantId: string, adminId: string, adminCtx: any;
const recurringIds: string[] = [];
const call = (c: any) => createCallerFactory(appRouter)(c);

beforeAll(async () => {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "arena-tech" } });
  const admin = await prisma.user.findFirstOrThrow({ where: { name: "Admin Arena" } });
  tenantId = tenant.id;
  adminId = admin.id;
  adminCtx = {
    session: { user: { id: adminId, isSuperAdmin: false }, activeTenantId: tenantId, availableTenants: [{ id: tenantId, slug: "arena-tech", role: "admin" }] },
    tenantId,
    withTenant: (fn: any) => withTenant(tenantId, fn),
  };
});

afterAll(async () => {
  const txs = await prisma.financialTransaction.findMany({
    where: { referenceType: "recurring_expense", referenceId: { in: recurringIds } },
    select: { id: true },
  });
  const txIds = txs.map((t) => t.id);
  await prisma.installment.deleteMany({ where: { transactionId: { in: txIds } } });
  await prisma.financialTransaction.deleteMany({ where: { id: { in: txIds } } });
  await prisma.recurringExpense.deleteMany({ where: { id: { in: recurringIds } } });
  await prisma.$disconnect();
});

async function makeTemplate(dayOfMonth: number) {
  const r = await prisma.recurringExpense.create({
    data: {
      tenantId, type: "PAYABLE", description: `${MARK}-aluguel`, amountCents: 150000,
      dayOfMonth, active: true,
    },
  });
  recurringIds.push(r.id);
  return r;
}

describe("C6 — despesas recorrentes", () => {
  it("gera a conta do mês uma vez (idempotente) e respeita o dia", async () => {
    const now = new Date("2026-07-15T12:00:00-03:00"); // dia 15 de jul/2026
    const dueTemplate = await makeTemplate(5); // dia 5 → já venceu (5<=15)
    const futureTemplate = await makeTemplate(20); // dia 20 → ainda não (20>15)

    const first = await generateDueRecurringExpenses(now);
    expect(first.generated).toBeGreaterThanOrEqual(1);

    // Gerou a do dia 5.
    const genDue = await prisma.financialTransaction.findFirst({
      where: { referenceType: "recurring_expense", referenceId: dueTemplate.id },
    });
    expect(genDue).not.toBeNull();
    expect(Number(genDue!.totalAmount)).toBe(1500);
    expect(genDue!.status).toBe("PENDING");

    // NÃO gerou a do dia 20 (futura no mês).
    const genFuture = await prisma.financialTransaction.findFirst({
      where: { referenceType: "recurring_expense", referenceId: futureTemplate.id },
    });
    expect(genFuture).toBeNull();

    // Template do dia 5 marcado com o período gerado.
    const afterDue = await prisma.recurringExpense.findUniqueOrThrow({ where: { id: dueTemplate.id } });
    expect(afterDue.lastGeneratedPeriod).toBe("2026-07");

    // Idempotência: 2ª execução não duplica a do dia 5.
    await generateDueRecurringExpenses(now);
    const count = await prisma.financialTransaction.count({
      where: { referenceType: "recurring_expense", referenceId: dueTemplate.id },
    });
    expect(count).toBe(1);
  });

  it("tRPC: cria, lista, alterna e remove um template", async () => {
    const created = await call(adminCtx).recurringExpense.create({
      type: "PAYABLE", description: `${MARK}-internet`, amountCents: 12000, dayOfMonth: 10,
    });
    recurringIds.push(created.id);

    const list = await call(adminCtx).recurringExpense.list();
    expect(list.some((r: any) => r.id === created.id)).toBe(true);

    await call(adminCtx).recurringExpense.toggle({ id: created.id, active: false });
    const afterToggle = await prisma.recurringExpense.findUniqueOrThrow({ where: { id: created.id } });
    expect(afterToggle.active).toBe(false);

    await call(adminCtx).recurringExpense.delete({ id: created.id });
    const afterDelete = await prisma.recurringExpense.findUnique({ where: { id: created.id } });
    expect(afterDelete).toBeNull();
  });
});
