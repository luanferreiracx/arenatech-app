/**
 * Auditoria Financeira — bugs de dinheiro (ao vivo).
 * REC-B1: unsettle de recebível cuja venda foi CANCELADA vai para CANCELLED,
 *         não PENDING (não vira dinheiro fantasma a receber).
 * CX-B2:  cashier.close recalcula o esperado por método no servidor — operador
 *         não consegue esconder divergência mandando expected==reported.
 * FIN-B3: stats.overdueAmount inclui conta PARTIALLY_PAID com parcela vencida.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
vi.mock("@/server/auth", () => ({ auth: async () => null }));
import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createCallerFactory } from "@/server/api/trpc";
import { appRouter } from "@/server/api/root";
import { withTenant } from "@/server/db";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const MARK = "fin-money-test";
let tenantId: string, adminId: string, adminCtx: any;
const cleanup = { crs: [] as string[], sales: [] as string[], acq: "", brand: "", fts: [] as string[] };

const call = (c: any) => createCallerFactory(appRouter)(c);

beforeAll(async () => {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "arena-tech" } });
  const admin = await prisma.user.findFirstOrThrow({ where: { name: "Admin Arena" } });
  tenantId = tenant.id; adminId = admin.id;
  adminCtx = { session: { user: { id: adminId, isSuperAdmin: false }, activeTenantId: tenantId, availableTenants: [{ id: tenantId, slug: "arena-tech", role: "admin" }] }, tenantId, withTenant: (fn: any) => withTenant(tenantId, fn) };
});

afterAll(async () => {
  // limpa sessões de caixa abertas/criadas pelo teste CX-B2
  const sessions = await prisma.cashSession.findMany({ where: { tenantId, movements: { some: { description: { startsWith: MARK } } } }, select: { id: true } });
  const sessionIds = sessions.map((s) => s.id);
  if (sessionIds.length) {
    await prisma.cashMovement.deleteMany({ where: { cashSessionId: { in: sessionIds } } });
    await prisma.cashSession.deleteMany({ where: { id: { in: sessionIds } } });
  }
  await prisma.cardReceivable.deleteMany({ where: { id: { in: cleanup.crs } } });
  for (const sid of cleanup.sales) { await prisma.saleItem.deleteMany({ where: { saleId: sid } }); }
  await prisma.sale.deleteMany({ where: { id: { in: cleanup.sales } } });
  if (cleanup.acq) await prisma.acquirer.deleteMany({ where: { id: cleanup.acq } });
  if (cleanup.brand) await prisma.cardBrand.deleteMany({ where: { id: cleanup.brand } });
  await prisma.installment.deleteMany({ where: { transactionId: { in: cleanup.fts } } });
  await prisma.financialTransaction.deleteMany({ where: { id: { in: cleanup.fts } } });
  await prisma.$disconnect();
});

describe("Auditoria Financeira — bugs de dinheiro (ao vivo)", () => {
  it("REC-B1: unsettle de recebível de venda CANCELADA vai p/ CANCELLED, não PENDING", async () => {
    const acq = await prisma.acquirer.create({ data: { tenantId, name: `${MARK}-acq`, active: true } });
    const brand = await prisma.cardBrand.create({ data: { tenantId, name: `${MARK}-visa`, active: true } });
    cleanup.acq = acq.id; cleanup.brand = brand.id;
    // venda CANCELADA
    const sale = await prisma.sale.create({ data: { tenantId, number: `${MARK}-${Date.now()}`, sellerId: adminId, publicLink: `${MARK}-l-${Date.now()}`, status: "CANCELLED" as any, saleDate: new Date(), subtotal: 100, totalAmount: 100, paidAmount: 100, isOSPayment: false } });
    cleanup.sales.push(sale.id);
    // recebível SETTLED apontando pra essa venda
    const cr = await prisma.cardReceivable.create({ data: { tenantId, acquirerId: acq.id, cardBrandId: brand.id, saleId: sale.id, kind: "CREDIT" as any, installmentNumber: 1, installmentsTotal: 1, grossAmount: 100, feeAmount: 3, netAmount: 97, expectedSettlementDate: new Date(), status: "SETTLED" as any, settledAt: new Date(), settledNetAmount: 97 } });
    cleanup.crs.push(cr.id);

    const res = await call(adminCtx).receiving.cardReceivables.unsettle({ ids: [cr.id] });
    expect(res.toCancelled).toBe(1);
    expect(res.toPending).toBe(0);
    const after = await prisma.cardReceivable.findUniqueOrThrow({ where: { id: cr.id } });
    expect(after.status).toBe("CANCELLED"); // NÃO PENDING (sem dinheiro fantasma)
  });

  it("REC-B1: unsettle de recebível de venda ATIVA volta normalmente p/ PENDING", async () => {
    const sale = await prisma.sale.create({ data: { tenantId, number: `${MARK}-ok-${Date.now()}`, sellerId: adminId, publicLink: `${MARK}-lok-${Date.now()}`, status: "COMPLETED" as any, saleDate: new Date(), subtotal: 100, totalAmount: 100, paidAmount: 100, isOSPayment: false } });
    cleanup.sales.push(sale.id);
    const cr = await prisma.cardReceivable.create({ data: { tenantId, acquirerId: cleanup.acq, cardBrandId: cleanup.brand, saleId: sale.id, kind: "CREDIT" as any, installmentNumber: 1, installmentsTotal: 1, grossAmount: 100, feeAmount: 3, netAmount: 97, expectedSettlementDate: new Date(), status: "SETTLED" as any, settledAt: new Date(), settledNetAmount: 97 } });
    cleanup.crs.push(cr.id);

    const res = await call(adminCtx).receiving.cardReceivables.unsettle({ ids: [cr.id] });
    expect(res.toPending).toBe(1);
    expect(res.toCancelled).toBe(0);
    const after = await prisma.cardReceivable.findUniqueOrThrow({ where: { id: cr.id } });
    expect(after.status).toBe("PENDING");
  });

  it("FIN-B3: stats.overdueAmount inclui conta PARTIALLY_PAID com parcela vencida", async () => {
    // Cria FT RECEIVABLE com 2 parcelas: uma paga, outra VENCIDA em aberto.
    const past = new Date(Date.now() - 10 * 864e5);
    const ft = await prisma.financialTransaction.create({
      data: {
        tenantId, type: "RECEIVABLE", status: "PARTIALLY_PAID", description: `${MARK}-part`,
        totalAmount: new Prisma.Decimal(200), paidAmount: new Prisma.Decimal(100),
        installmentsTotal: 2, dueDate: past, emissionDate: past, createdByUserId: adminId,
        installments: { create: [
          { tenantId, number: 1, amount: new Prisma.Decimal(100), paidAmount: new Prisma.Decimal(100), status: "PAID", dueDate: past, paidAt: past },
          { tenantId, number: 2, amount: new Prisma.Decimal(100), paidAmount: new Prisma.Decimal(0), status: "PARTIALLY_PAID", dueDate: past },
        ] },
      },
    });
    cleanup.fts.push(ft.id);

    const stats = await call(adminCtx).financial.stats({ type: "RECEIVABLE" });
    // a parcela 2 (R$100 vencida, saldo 100) deve entrar no vencido
    expect(stats.overdueAmount).toBeGreaterThanOrEqual(10000); // >= R$100,00 em centavos
    expect(stats.overdueCount).toBeGreaterThanOrEqual(1);
  });

  it("CX-B2: close recalcula esperado por método no servidor (operador não esconde divergência)", async () => {
    // Garante caixa aberto (reusa se já houver um aberto do admin).
    const existing = await prisma.cashSession.findFirst({
      where: { tenantId, userId: adminId, closedAt: null },
      select: { id: true },
    });
    const session = existing ?? (await call(adminCtx).cashier.open({ initialBalance: 0 }));
    await prisma.cashMovement.create({
      data: {
        tenantId, cashSessionId: session.id, type: "SALE" as any, nature: "INCOME" as any,
        amount: new Prisma.Decimal(100), paymentMethod: "pix", description: `${MARK}-venda-pix`,
        createdByUserId: adminId,
      },
    });

    // Operador MENTE: diz que conferiu o PIX (verified=true) e manda
    // expected=reported=0 tentando esconder que o esperado real é R$100.
    await call(adminCtx).cashier.close({
      declaredBalance: 0, // dinheiro em gaveta (não teve venda em dinheiro)
      closingNote: "fechamento de teste",
      methodVerifications: [
        { method: "pix", verified: false, reportedAmount: 0, expectedAmount: 0 },
      ],
    });

    // O servidor recalcula pix esperado=100, reported=0 → grava divergência na nota.
    const closed = await prisma.cashSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(closed.closingNote ?? "").toMatch(/Diverg[eê]ncias.*pix.*esperado=100\.00.*contado=0\.00/i);
  });
});
