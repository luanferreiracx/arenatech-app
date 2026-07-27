/**
 * Auditoria 2026-07-25 — NF-e duplicada para a mesma venda/OS.
 *
 * `createFromSale`/`createFromServiceOrder` iam direto pro `invoice.create`, sem
 * checar nota preexistente, e o schema só tinha índice NÃO-único em
 * `[tenantId, referenceId]`. O CAS de `authorize` protege a MESMA invoice contra
 * duplo-clique — não impede DUAS invoices distintas da mesma venda.
 *
 * Cenário real: operador clica "Emitir NF-e", a tela não atualiza, clica de
 * novo → dois DRAFTs → ambos autorizáveis → duas NF-e válidas na SEFAZ para uma
 * venda. Desfazer exige cancelamento na SEFAZ (janela de 24h) e afeta apuração.
 *
 * Duas camadas: guard na procedure (mensagem amigável) + índice único parcial
 * no banco (fecha a janela de corrida do read-then-write).
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
const MARK = "fiscal-one-invoice";
let tenantId: string, adminId: string, ctx: any, productId: string;
const saleIds: string[] = [];

const caller = () => createCallerFactory(appRouter)(ctx);

beforeAll(async () => {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "arena-tech" } });
  const admin = await prisma.user.findFirstOrThrow({ where: { name: "Admin Arena" } });
  tenantId = tenant.id;
  adminId = admin.id;
  ctx = {
    session: {
      user: { id: adminId, isSuperAdmin: false },
      activeTenantId: tenantId,
      availableTenants: [{ id: tenantId, slug: "arena-tech", role: "admin", modules: ["fiscal", "pdv", "stock", "cashier", "financial"] }],
    },
    tenantId,
    withTenant: (fn: any) => withTenant(tenantId, fn),
  };
  productId = (await prisma.product.create({
    data: { tenantId, name: `${MARK}-p`, salePrice: 100, costPrice: 50, currentStock: 100, active: true },
  })).id;
  await closeTestCashSessions(prisma, { tenantId, userId: adminId });
  await openTestCashSession(prisma, { tenantId, userId: adminId, initialBalance: 0 });
});

afterAll(async () => {
  for (const sid of saleIds) {
    const invs = await prisma.invoice.findMany({ where: { referenceId: sid }, select: { id: true } });
    const invIds = invs.map((i) => i.id);
    await prisma.invoiceItem.deleteMany({ where: { invoiceId: { in: invIds } } });
    await prisma.invoice.deleteMany({ where: { id: { in: invIds } } });
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
  await closeTestCashSessions(prisma, { tenantId, userId: adminId });
  await prisma.product.deleteMany({ where: { id: productId } });
  await prisma.$disconnect();
});

async function makeSale() {
  const c = caller();
  const draft = await c.sale.createDraft();
  saleIds.push(draft.id);
  await c.sale.addItem({ saleId: draft.id, productId, quantity: 1, unitPrice: 10000 });
  await c.sale.finalize({ saleId: draft.id, payments: [{ method: "dinheiro", amount: 10000 }] });
  return draft.id;
}

describe("fiscal — uma nota ATIVA por venda", () => {
  it("segunda emissão para a mesma venda é bloqueada (duplo-clique)", async () => {
    const saleId = await makeSale();

    const first = await caller().fiscal.createFromSale({ saleId, type: "NFE" });
    expect(first.id).toBeTruthy();

    await expect(
      caller().fiscal.createFromSale({ saleId, type: "NFE" }),
    ).rejects.toThrow(/ja existe documento fiscal|em andamento/i);

    const notas = await prisma.invoice.count({ where: { referenceId: saleId } });
    expect(notas).toBe(1);
  });

  it("depois de CANCELAR a nota, pode emitir outra (fluxo normal)", async () => {
    const saleId = await makeSale();
    const first = await caller().fiscal.createFromSale({ saleId, type: "NFE" });

    await prisma.invoice.update({ where: { id: first.id }, data: { status: "CANCELLED" } });

    const second = await caller().fiscal.createFromSale({ saleId, type: "NFE" });
    expect(second.id).not.toBe(first.id);
  });

  it("o banco tem a rede: índice único parcial impede a duplicata sob corrida", async () => {
    const saleId = await makeSale();
    await caller().fiscal.createFromSale({ saleId, type: "NFE" });

    // Bypassa a procedure (simula a janela do read-then-write) e escreve direto.
    await expect(
      prisma.invoice.create({
        data: {
          tenantId,
          type: "NFE",
          status: "DRAFT",
          recipientName: "Consumidor Final",
          recipientCpfCnpj: "",
          totalAmount: 100,
          referenceId: saleId,
          referenceType: "SALE",
          createdById: adminId,
        },
      }),
    ).rejects.toThrow();
  });
});
