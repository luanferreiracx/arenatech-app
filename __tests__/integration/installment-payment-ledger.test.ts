/**
 * Auditoria Financeira — FIN-B2 ledger de pagamentos (ao vivo).
 * payInstallment grava uma linha no ledger por evento; reverseInstallment grava
 * uma linha NEGATIVA. stats.paidMonthAmount (regime de caixa) soma o ledger por
 * paidAt — um pagamento de mês anterior NÃO conta no mês corrente, e o valor
 * cheio não é jogado no mês da última parcela.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
vi.mock("@/server/auth", () => ({ auth: async () => null }));
import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createCallerFactory } from "@/server/api/trpc";
import { appRouter } from "@/server/api/root";
import { withTenant } from "@/server/db";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const MARK = "ledger-test";
let tenantId: string, adminId: string, adminCtx: any;
const fts: string[] = [];

const call = (c: any) => createCallerFactory(appRouter)(c);

beforeAll(async () => {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "arena-tech" } });
  const admin = await prisma.user.findFirstOrThrow({ where: { name: "Admin Arena" } });
  tenantId = tenant.id; adminId = admin.id;
  adminCtx = { session: { user: { id: adminId, isSuperAdmin: false }, activeTenantId: tenantId, availableTenants: [{ id: tenantId, slug: "arena-tech", role: "admin" }] }, tenantId, withTenant: (fn: any) => withTenant(tenantId, fn) };
});

afterAll(async () => {
  await prisma.installmentPayment.deleteMany({ where: { transactionId: { in: fts } } });
  await prisma.installment.deleteMany({ where: { transactionId: { in: fts } } });
  await prisma.financialTransaction.deleteMany({ where: { id: { in: fts } } });
  await prisma.$disconnect();
});

async function makeReceivable(): Promise<{ ftId: string; instId: string }> {
  const ft = await prisma.financialTransaction.create({
    data: {
      tenantId, type: "RECEIVABLE", status: "PENDING", description: `${MARK}-${Math.random()}`,
      totalAmount: new Prisma.Decimal(100), paidAmount: new Prisma.Decimal(0),
      installmentsTotal: 1, dueDate: new Date(), emissionDate: new Date(), createdByUserId: adminId,
      installments: { create: [{ tenantId, number: 1, amount: new Prisma.Decimal(100), paidAmount: new Prisma.Decimal(0), status: "PENDING", dueDate: new Date() }] },
    },
    include: { installments: true },
  });
  fts.push(ft.id);
  return { ftId: ft.id, instId: ft.installments[0]!.id };
}

describe("Auditoria Financeira — FIN-B2 ledger (ao vivo)", () => {
  it("payInstallment cria linha no ledger; estorno cria linha negativa", async () => {
    // estorno exige caixa aberto (P3) — garante um
    const openSession = await prisma.cashSession.findFirst({ where: { tenantId, userId: adminId, closedAt: null }, select: { id: true } });
    if (!openSession) {
      await prisma.cashSession.create({ data: { tenantId, userId: adminId, initialBalance: new Prisma.Decimal(0) } });
    }
    const { ftId, instId } = await makeReceivable();
    // paga integral (R$100) → instalment vira PAID (permite estorno)
    await call(adminCtx).financial.payInstallment({ installmentId: instId, amountPaid: 10000, paymentMethod: "pix" });

    const afterPay = await prisma.installmentPayment.findMany({ where: { transactionId: ftId } });
    expect(afterPay.length).toBe(1);
    expect(afterPay[0]!.amountCents).toBe(10000);
    expect(afterPay[0]!.kind).toBe("payment");

    // estorno parcial de R$40 → linha negativa
    await call(adminCtx).financial.reverseInstallment({ installmentId: instId, amount: 4000, reason: "teste" });
    const all = await prisma.installmentPayment.findMany({ where: { transactionId: ftId }, orderBy: { createdAt: "asc" } });
    expect(all.length).toBe(2);
    const reversal = all.find((p) => p.kind === "reversal");
    expect(reversal?.amountCents).toBe(-4000);
    // líquido no ledger = 10000 - 4000 = 6000
    expect(all.reduce((s, p) => s + p.amountCents, 0)).toBe(6000);
  });

  it("FIN-B2: pagamento de mês ANTERIOR não conta no paidMonth do mês corrente", async () => {
    const { ftId, instId } = await makeReceivable();
    // paga R$100 hoje (entra no mês corrente)
    await call(adminCtx).financial.payInstallment({ installmentId: instId, amountPaid: 10000, paymentMethod: "pix" });

    // injeta um pagamento com data no MÊS PASSADO (simula multi-mês)
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1, 15);
    await prisma.installmentPayment.create({
      data: { tenantId, installmentId: instId, transactionId: ftId, amountCents: 99999, paymentMethod: "pix", paidAt: lastMonth, kind: "payment", createdByUserId: adminId },
    });

    const stats = await call(adminCtx).financial.stats({ type: "RECEIVABLE" });
    // o paidMonth deve INCLUIR os 10000 de hoje mas NÃO os 99999 do mês passado.
    // (outras contas do tenant também somam; então checamos que o valor gigante
    //  do mês passado não vazou: paidMonth < 99999 seria fraco — em vez disso,
    //  comparamos o delta ao remover a linha do mês passado.)
    expect(stats.paidMonthAmount).toBeGreaterThanOrEqual(10000);
    // o valor do mês passado (99999) não pode ter entrado:
    const ledgerThisMonthOnly = await prisma.installmentPayment.aggregate({
      where: { installment: { transaction: { type: "RECEIVABLE", deletedAt: null } }, paidAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } },
      _sum: { amountCents: true },
    });
    expect(stats.paidMonthAmount).toBe(ledgerThisMonthOnly._sum.amountCents ?? 0);
    expect(stats.paidMonthAmount).toBeLessThan(99999 + 10000); // o 99999 do mês passado ficou de fora
  });
});
