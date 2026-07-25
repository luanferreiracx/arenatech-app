/**
 * Auditoria 2026-07-25 — completude do ledger `installment_payments`.
 *
 * A linha de DESPESA do DRE (`financial.dre`) e o `stats.paidMonthAmount` leem
 * SÓ de `installment_payments`. Mas lançamentos que nascem PAID (compra de
 * aparelho à vista, OS paga em dinheiro/pix, venda à vista não-cartão) criavam
 * a FinancialTransaction PAID sem parcela e sem ledger — sumiam do relatório.
 *
 * Medido em produção antes do fix: R$ 342.130,00 de despesa (62 compras de
 * aparelho, 24% da despesa do ano) fora do DRE, inflando o lucro; e
 * R$ 266.952,33 em 425 recebimentos fora do "recebido no mês".
 *
 * Teste-guardião: toda FinancialTransaction PAID com paid_amount > 0 precisa
 * ter a soma do ledger batendo com o valor pago.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
vi.mock("@/server/auth", () => ({ auth: async () => null }));
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createCallerFactory } from "@/server/api/trpc";
import { appRouter } from "@/server/api/root";
import { withTenant } from "@/server/db";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const MARK = "ledger-completeness";
let ctx: any, tenantId: string, adminId: string, productId: string;
const saleIds: string[] = [];

const caller = () => createCallerFactory(appRouter)(ctx);

beforeAll(async () => {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "arena-tech" } });
  const admin = await prisma.user.findFirstOrThrow({ where: { name: "Admin Arena" } });
  tenantId = tenant.id;
  adminId = admin.id;
  ctx = {
    session: { user: { id: adminId, isSuperAdmin: false }, activeTenantId: tenantId, availableTenants: [{ id: tenantId, slug: "arena-tech", role: "admin" }] },
    tenantId,
    withTenant: (fn: any) => withTenant(tenantId, fn),
  };
  productId = (await prisma.product.create({
    data: { tenantId, name: `${MARK}-p`, salePrice: 100, costPrice: 50, currentStock: 100, active: true },
  })).id;
  await prisma.cashSession.deleteMany({ where: { userId: adminId, closedAt: null } });
  await prisma.cashSession.create({ data: { tenantId, userId: adminId, initialBalance: 0 } });
});

afterAll(async () => {
  for (const sid of saleIds) {
    const fts = await prisma.financialTransaction.findMany({ where: { saleId: sid }, select: { id: true } });
    const ftIds = fts.map((f) => f.id);
    await prisma.installmentPayment.deleteMany({ where: { transactionId: { in: ftIds } } });
    await prisma.installment.deleteMany({ where: { transactionId: { in: ftIds } } });
    await prisma.financialTransaction.deleteMany({ where: { id: { in: ftIds } } });
    await prisma.cashMovement.deleteMany({ where: { referenceId: sid } });
    await prisma.stockMovement.deleteMany({ where: { referenceId: sid } });
    await prisma.saleAudit.deleteMany({ where: { saleId: sid } });
    await prisma.saleItem.deleteMany({ where: { saleId: sid } });
    await prisma.sale.deleteMany({ where: { id: sid } });
  }
  const open = await prisma.cashSession.findMany({ where: { userId: adminId, closedAt: null }, select: { id: true } });
  for (const s of open) await prisma.cashMovement.deleteMany({ where: { cashSessionId: s.id } });
  await prisma.cashSession.deleteMany({ where: { userId: adminId, closedAt: null } });
  await prisma.product.deleteMany({ where: { id: productId } });
  await prisma.$disconnect();
});

describe("ledger installment_payments — completude (DRE / recebido no mês)", () => {
  it("venda à vista em dinheiro entra no ledger (antes sumia do 'recebido no mês')", async () => {
    const c = caller();
    const draft = await c.sale.createDraft();
    saleIds.push(draft.id);
    await c.sale.addItem({ saleId: draft.id, productId, quantity: 1, unitPrice: 10000 });
    await c.sale.finalize({ saleId: draft.id, payments: [{ method: "dinheiro", amount: 10000 }] });

    const ft = await prisma.financialTransaction.findFirstOrThrow({
      where: { saleId: draft.id, type: "RECEIVABLE", status: "PAID" },
    });
    const ledger = await prisma.installmentPayment.findMany({ where: { transactionId: ft.id } });

    expect(ledger.length).toBeGreaterThan(0);
    const soma = ledger.reduce((s, l) => s + l.amountCents, 0);
    expect(soma).toBe(10000); // R$100 no ledger = o que o DRE/stats vai somar
  });

  it("GUARDIÃO: toda transação PAID tem o ledger batendo com o paid_amount", async () => {
    const divergentes = await prisma.$queryRaw<Array<{ id: string; pago: number; ledger: number }>>`
      SELECT t.id,
             t.paid_amount::float AS pago,
             COALESCE((SELECT SUM(ip.amount_cents) FROM installment_payments ip
                        WHERE ip.transaction_id = t.id), 0)::float / 100 AS ledger
      FROM financial_transactions t
      WHERE t.status = 'PAID'
        AND t.deleted_at IS NULL
        AND t.paid_amount > 0
        AND t.tenant_id = ${tenantId}::uuid
        AND ABS(
          t.paid_amount - COALESCE((SELECT SUM(ip.amount_cents) FROM installment_payments ip
                                     WHERE ip.transaction_id = t.id), 0)::numeric / 100
        ) > 0.005
      LIMIT 20
    `;
    expect(divergentes).toEqual([]);
  });
});
