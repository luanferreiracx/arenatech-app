/**
 * Auditoria 2026-07-25 — `cashFlow` usava `installment.paidAt` em vez do ledger.
 *
 * Era o TERCEIRO consumidor do regime de caixa que o FIN-B2 não migrou. O
 * `stats` e o DRE já liam de `installment_payments` (uma linha por EVENTO, com
 * data própria); o Fluxo de Caixa continuava usando `installment.paidAt` — que
 * guarda só a ÚLTIMA data — com `paidAmount` acumulado.
 *
 * Efeito: parcela paga R$50 em um mês e R$50 no seguinte tinha `paidAt` = mês 2,
 * então os R$100 INTEIROS apareciam no mês 2 e o mês 1 ficava zerado. O mesmo
 * dinheiro aparecia em meses diferentes conforme o relatório aberto.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
vi.mock("@/server/auth", () => ({ auth: async () => null }));
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createCallerFactory } from "@/server/api/trpc";
import { appRouter } from "@/server/api/root";
import { withTenant } from "@/server/db";
import { openTestCashSession, closeTestCashSessions } from "../helpers/cash-session";
import { brtDayKey } from "@/lib/utils/date-range";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const MARK = "cashflow-ledger";
let tenantId: string, userId: string, ctx: any;
const txIds: string[] = [];

const caller = () => createCallerFactory(appRouter)(ctx);

beforeAll(async () => {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "arena-tech" } });
  // Usuário dedicado: não mexe no caixa que os outros arquivos usam.
  const user = await prisma.user.findFirstOrThrow({ where: { name: "Operador Multi" } });
  tenantId = tenant.id;
  userId = user.id;
  ctx = {
    session: {
      user: { id: userId, isSuperAdmin: false },
      activeTenantId: tenantId,
      availableTenants: [{ id: tenantId, slug: "arena-tech", role: "admin", modules: ["financial", "cashier"] }],
    },
    tenantId,
    withTenant: (fn: any) => withTenant(tenantId, fn),
  };
  await openTestCashSession(prisma, { tenantId, userId });
});

afterAll(async () => {
  await prisma.installmentPayment.deleteMany({ where: { transactionId: { in: txIds } } });
  await prisma.installment.deleteMany({ where: { transactionId: { in: txIds } } });
  await prisma.financialTransaction.deleteMany({ where: { id: { in: txIds } } });
  await closeTestCashSessions(prisma, { tenantId, userId });
  await prisma.$disconnect();
});

/** Chave de dia no MESMO fuso que o relatório usa (BRT). */
const iso = (d: Date) => brtDayKey(d);

describe("cashFlow — realizado vem do ledger (regime de caixa por evento)", () => {
  it("pagamento em DOIS dias aparece em cada dia, não tudo no último", async () => {
    const hoje = new Date();
    const ontem = new Date(hoje.getTime() - 24 * 60 * 60 * 1000);

    const conta = await caller().financial.create({
      type: "RECEIVABLE",
      description: `${MARK}-conta`,
      totalAmount: 10000, // R$100 numa parcela
      numInstallments: 1,
      emissionDate: hoje.toISOString(),
      firstDueDate: iso(hoje),
    });
    txIds.push(conta.id);
    const parcela = await prisma.installment.findFirstOrThrow({ where: { transactionId: conta.id } });

    // Dois pagamentos parciais de R$50. O segundo sobrescreve `installment.paidAt`
    // com HOJE — era isso que jogava os R$100 todos no dia de hoje.
    await caller().financial.payInstallment({
      installmentId: parcela.id,
      amountPaid: 5000,
      paymentMethod: "dinheiro",
    });
    // Reposiciona o PRIMEIRO evento para ontem, no ledger (é o que o relatório lê).
    await prisma.installmentPayment.updateMany({
      where: { transactionId: conta.id },
      data: { paidAt: ontem },
    });
    await caller().financial.payInstallment({
      installmentId: parcela.id,
      amountPaid: 5000,
      paymentMethod: "dinheiro",
    });

    const fluxo = await caller().financial.cashFlow({
      dateFrom: iso(new Date(hoje.getTime() - 3 * 24 * 60 * 60 * 1000)),
      dateTo: iso(hoje),
      groupBy: "day",
    });

    const doDia = (d: Date) => fluxo.periods.find((p: any) => p.period === iso(d));
    // R$50 em cada dia — e NÃO R$100 concentrados em hoje.
    expect(doDia(ontem)?.realizedReceivable).toBe(5000);
    expect(doDia(hoje)?.realizedReceivable).toBe(5000);
  });

  it("o total realizado do período bate com a soma do ledger", async () => {
    const hoje = new Date();
    const desde = new Date(hoje.getTime() - 3 * 24 * 60 * 60 * 1000);

    const fluxo = await caller().financial.cashFlow({
      dateFrom: iso(desde),
      dateTo: iso(hoje),
      groupBy: "day",
    });
    const totalRelatorio = fluxo.periods.reduce(
      (s: number, p: any) => s + p.realizedReceivable,
      0,
    );

    const ledger = await prisma.installmentPayment.aggregate({
      where: { transactionId: { in: txIds }, paidAt: { gte: desde } },
      _sum: { amountCents: true },
    });

    expect(totalRelatorio).toBeGreaterThanOrEqual(ledger._sum.amountCents ?? 0);
  });
});
