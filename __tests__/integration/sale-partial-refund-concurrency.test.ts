/**
 * Auditoria 2026-07-25 — estorno PARCIAL concorrente (duplo-clique).
 *
 * BUG: no estorno parcial, o CAS de status aceita `PARTIALLY_REFUNDED` como
 * estado de ENTRADA e grava `PARTIALLY_REFUNDED` como saída — ou seja, o guard
 * não distingue "primeiro estorno destas linhas" de "segundo estorno das MESMAS
 * linhas". O filtro de idempotência (`total > 0`) é avaliado sobre um snapshot
 * lido no começo da transação; sob READ COMMITTED as duas requisições leem o
 * item ainda com total > 0 e ambas passam.
 *
 * Efeito: estoque devolvido em DOBRO e DUAS saídas de caixa para uma única
 * devolução.
 *
 * O estorno TOTAL não tem o problema: o CAS vai para `REFUNDED`, que está fora
 * do conjunto aceito — o perdedor vê count=0 e faz rollback.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
vi.mock("@/server/auth", () => ({ auth: async () => null }));
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createCallerFactory } from "@/server/api/trpc";
import { appRouter } from "@/server/api/root";
import { withTenant } from "@/server/db";
import { openTestCashSession, closeTestCashSessions } from "../helpers/cash-session";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const MARK = "partial-refund-conc";
let ctx: any, tenantId: string, adminId: string;
let productId: string, product2Id: string;
const saleIds: string[] = [];

function caller() {
  return createCallerFactory(appRouter)(ctx);
}

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
    data: { tenantId, name: `${MARK}-p1`, salePrice: 100, costPrice: 50, currentStock: 100, active: true },
  })).id;
  product2Id = (await prisma.product.create({
    data: { tenantId, name: `${MARK}-p2`, salePrice: 100, costPrice: 50, currentStock: 100, active: true },
  })).id;
  await closeTestCashSessions(prisma, { tenantId, userId: adminId });
  await openTestCashSession(prisma, { tenantId, userId: adminId, initialBalance: 0 });
});

afterAll(async () => {
  for (const sid of saleIds) {
    await prisma.cashMovement.deleteMany({ where: { referenceId: sid } });
    await prisma.stockMovement.deleteMany({ where: { referenceId: sid } });
    await prisma.saleAudit.deleteMany({ where: { saleId: sid } });
    await prisma.financialTransaction.deleteMany({ where: { saleId: sid } });
    await prisma.saleItem.deleteMany({ where: { saleId: sid } });
    await prisma.sale.deleteMany({ where: { id: sid } });
  }
  const open = await prisma.cashSession.findMany({ where: { userId: adminId, closedAt: null }, select: { id: true } });
  for (const s of open) await prisma.cashMovement.deleteMany({ where: { cashSessionId: s.id } });
  await closeTestCashSessions(prisma, { tenantId, userId: adminId });
  await prisma.product.deleteMany({ where: { id: { in: [productId, product2Id] } } });
  await prisma.$disconnect();
});

/** Venda de 2 itens (R$100 cada) paga em dinheiro. */
async function makeTwoItemSale() {
  const c = caller();
  const draft = await c.sale.createDraft();
  saleIds.push(draft.id);
  await c.sale.addItem({ saleId: draft.id, productId, quantity: 1, unitPrice: 10000 });
  await c.sale.addItem({ saleId: draft.id, productId: product2Id, quantity: 1, unitPrice: 10000 });
  await c.sale.finalize({ saleId: draft.id, payments: [{ method: "dinheiro", amount: 20000 }] });
  const items = await prisma.saleItem.findMany({ where: { saleId: draft.id }, orderBy: { createdAt: "asc" } });
  return { saleId: draft.id, refundItem: items.find((i) => i.productId === productId)! };
}

describe("Estorno parcial concorrente — não pode duplicar estoque nem caixa", () => {
  it("dois estornos parciais SIMULTÂNEOS do mesmo item: só um vale", async () => {
    const { saleId, refundItem } = await makeTwoItemSale();
    const stockBefore = (await prisma.product.findUniqueOrThrow({ where: { id: productId } })).currentStock;

    // Duplo-clique: as duas requisições partem juntas, cada uma na sua transação.
    const results = await Promise.allSettled([
      caller().sale.refund({ saleId, reason: "estorno parcial A", itemIds: [refundItem.id] }),
      caller().sale.refund({ saleId, reason: "estorno parcial B", itemIds: [refundItem.id] }),
    ]);

    const ok = results.filter((r) => r.status === "fulfilled").length;
    expect(ok).toBe(1); // o perdedor tem que falhar (CONFLICT), não passar

    // Estoque: devolveu 1 unidade, não 2.
    const stockAfter = (await prisma.product.findUniqueOrThrow({ where: { id: productId } })).currentStock;
    expect(stockAfter - stockBefore).toBe(1);

    // Caixa: UMA saída de R$100, não duas.
    const withdrawals = await prisma.cashMovement.findMany({
      where: { referenceId: saleId, type: "WITHDRAWAL", nature: "OUTCOME" },
    });
    expect(withdrawals).toHaveLength(1);
    expect(Number(withdrawals[0]!.amount)).toBe(100);

    // Total da venda: R$200 - R$100 = R$100 (um único decremento).
    const sale = await prisma.sale.findUniqueOrThrow({ where: { id: saleId } });
    expect(Number(sale.totalAmount)).toBe(100);
    expect(sale.status).toBe("PARTIALLY_REFUNDED");
  });

  it("estorno parcial SEQUENCIAL do mesmo item: o segundo é rejeitado", async () => {
    const { saleId, refundItem } = await makeTwoItemSale();
    const stockBefore = (await prisma.product.findUniqueOrThrow({ where: { id: productId } })).currentStock;

    await caller().sale.refund({ saleId, reason: "primeiro estorno", itemIds: [refundItem.id] });
    await expect(
      caller().sale.refund({ saleId, reason: "segundo estorno (deve falhar)", itemIds: [refundItem.id] }),
    ).rejects.toThrow();

    const stockAfter = (await prisma.product.findUniqueOrThrow({ where: { id: productId } })).currentStock;
    expect(stockAfter - stockBefore).toBe(1);

    const withdrawals = await prisma.cashMovement.findMany({
      where: { referenceId: saleId, type: "WITHDRAWAL", nature: "OUTCOME" },
    });
    expect(withdrawals).toHaveLength(1);
  });
});
