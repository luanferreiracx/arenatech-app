/**
 * Auditoria Financeira — CX-B1 + forceClose-B3 (ao vivo).
 * CX-B1: despesa em DINHEIRO não pode exceder o saldo da gaveta (senão dirige
 *        expectedCashBalance a negativo). Em outro método, passa.
 * forceClose-B3: fechamento forçado NÃO fabrica saldo contado — declaredBalance
 *        e difference ficam NULL (pendente de conferência real).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
vi.mock("@/server/auth", () => ({ auth: async () => null }));
import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createCallerFactory } from "@/server/api/trpc";
import { appRouter } from "@/server/api/root";
import { withTenant } from "@/server/db";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const MARK = "cx-expense-test";
let tenantId: string, adminId: string, adminCtx: any;
const sessionIds: string[] = [];

const call = (c: any) => createCallerFactory(appRouter)(c);

beforeAll(async () => {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "arena-tech" } });
  const admin = await prisma.user.findFirstOrThrow({ where: { name: "Admin Arena" } });
  tenantId = tenant.id; adminId = admin.id;
  adminCtx = { session: { user: { id: adminId, isSuperAdmin: false }, activeTenantId: tenantId, availableTenants: [{ id: tenantId, slug: "arena-tech", role: "admin" }] }, tenantId, withTenant: (fn: any) => withTenant(tenantId, fn) };
  // fecha qualquer sessão aberta pré-existente do admin p/ isolar o teste
  await prisma.cashSession.updateMany({ where: { tenantId, userId: adminId, closedAt: null }, data: { closedAt: new Date(), closeType: "MANUAL", calculatedBalance: 0 } });
});

afterAll(async () => {
  for (const s of sessionIds) await prisma.cashMovement.deleteMany({ where: { cashSessionId: s } });
  await prisma.cashSession.deleteMany({ where: { id: { in: sessionIds } } });
  await prisma.$disconnect();
});

describe("Auditoria Financeira — CX-B1 + forceClose (ao vivo)", () => {
  it("CX-B1: despesa em dinheiro acima do saldo da gaveta é bloqueada; em outro método passa", async () => {
    // abre caixa com R$100 inicial
    const opened = await call(adminCtx).cashier.open({ initialBalance: 10000 });
    sessionIds.push(opened.id);

    // despesa em dinheiro de R$150 > gaveta (R$100) → bloqueia
    await expect(
      call(adminCtx).cashier.expense({ amount: 15000, paymentMethod: "dinheiro", description: "material caro" }),
    ).rejects.toThrow(/excede o saldo da gaveta/i);

    // despesa em dinheiro de R$80 <= R$100 → passa
    await expect(
      call(adminCtx).cashier.expense({ amount: 8000, paymentMethod: "dinheiro", description: "material" }),
    ).resolves.toEqual({ success: true });

    // despesa em PIX (não drena a gaveta) de R$999 → passa mesmo acima do dinheiro
    await expect(
      call(adminCtx).cashier.expense({ amount: 99900, paymentMethod: "pix", description: "servico" }),
    ).resolves.toEqual({ success: true });
  });

  it("forceClose-B3: fechamento forçado deixa declaredBalance/difference NULL (sem saldo fabricado)", async () => {
    // há um índice único parcial em (tenant_id, user_id) p/ sessões abertas.
    // Fecha a sessão aberta do teste anterior antes de criar a alvo do forceClose.
    await prisma.cashSession.updateMany({
      where: { tenantId, userId: adminId, closedAt: null },
      data: { closedAt: new Date(), closeType: "MANUAL", calculatedBalance: new Prisma.Decimal(0) },
    });
    const other = await prisma.cashSession.create({ data: { tenantId, userId: adminId, initialBalance: new Prisma.Decimal(50) } });
    sessionIds.push(other.id);

    await call(adminCtx).cashier.forceClose({ sessionId: other.id, reason: "operador sumiu" });

    const closed = await prisma.cashSession.findUniqueOrThrow({ where: { id: other.id } });
    expect(closed.closedAt).not.toBeNull();
    expect(closed.declaredBalance).toBeNull(); // NÃO fabrica o contado
    expect(closed.difference).toBeNull();      // sem divergência falsa
    expect(closed.verified).toBe(false);       // vai para conferência real
    expect(closed.calculatedBalance).not.toBeNull(); // o esperado (dinheiro) é gravado
  });
});
