/**
 * Auditoria Financeiro/Caixa — segregação de funções (ao vivo).
 * A2: operador não baixa parcela de conta a PAGAR (payInstallment).
 * A3: operador não edita conta a PAGAR (update).
 * A1: operador não vê openCashiers/byId de outro operador.
 * K4: gerente ajusta o caixa de um operador via sessionId (movimento cai na
 *     sessão do operador, não na do gerente).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
vi.mock("@/server/auth", () => ({ auth: async () => null }));
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createCallerFactory } from "@/server/api/trpc";
import { appRouter } from "@/server/api/root";
import { withTenant } from "@/server/db";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const MARK = "fin-authz-test";
let tenantId: string, adminId: string, operatorId: string;
let adminCtx: any, operatorCtx: any;
const txIds: string[] = [];
const sessionIds: string[] = [];

function mkCtx(userId: string, role: string) {
  return {
    session: { user: { id: userId, isSuperAdmin: false }, activeTenantId: tenantId, availableTenants: [{ id: tenantId, slug: "arena-tech", role }] },
    tenantId, withTenant: (fn: any) => withTenant(tenantId, fn),
  };
}
const call = (c: any) => createCallerFactory(appRouter)(c);

async function makeTx(type: "PAYABLE" | "RECEIVABLE", amountCents: number) {
  const t = await prisma.financialTransaction.create({
    data: {
      tenantId, type, status: "PENDING", description: `${MARK}-${type}`,
      totalAmount: amountCents / 100, dueDate: new Date(), createdByUserId: adminId,
      installments: { create: [{ tenantId, number: 1, amount: amountCents / 100, dueDate: new Date(), status: "PENDING" }] },
    },
    include: { installments: true },
  });
  txIds.push(t.id);
  return { txId: t.id, installmentId: t.installments[0]!.id };
}

beforeAll(async () => {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "arena-tech" } });
  const admin = await prisma.user.findFirstOrThrow({ where: { name: "Admin Arena" } });
  const operator = await prisma.user.findFirstOrThrow({ where: { name: "Operador Arena" } });
  tenantId = tenant.id; adminId = admin.id; operatorId = operator.id;
  adminCtx = mkCtx(adminId, "admin");
  operatorCtx = mkCtx(operatorId, "operator");
});

afterAll(async () => {
  for (const s of sessionIds) await prisma.cashMovement.deleteMany({ where: { cashSessionId: s } });
  await prisma.cashSession.deleteMany({ where: { id: { in: sessionIds } } });
  for (const t of txIds) {
    await prisma.installment.deleteMany({ where: { transactionId: t } });
    await prisma.financialTransaction.deleteMany({ where: { id: t } });
  }
  await prisma.$disconnect();
});

describe("Auditoria Financeiro/Caixa — segregação (ao vivo)", () => {
  it("A2: operador NÃO baixa parcela de conta a pagar; baixa recebível OK", async () => {
    const payable = await makeTx("PAYABLE", 5000);
    await expect(
      call(operatorCtx).financial.payInstallment({ installmentId: payable.installmentId, amountPaid: 5000 }),
    ).rejects.toThrow(/contas a pagar/i);

    // Recebível: operador pode (precisa caixa aberto pra gravar o movimento).
    const s = await prisma.cashSession.create({ data: { tenantId, userId: operatorId, initialBalance: 0 } });
    sessionIds.push(s.id);
    const receivable = await makeTx("RECEIVABLE", 3000);
    await expect(
      call(operatorCtx).financial.payInstallment({ installmentId: receivable.installmentId, amountPaid: 3000, paymentMethod: "dinheiro" }),
    ).resolves.toBeTruthy();
  });

  it("A3: operador NÃO edita conta a pagar", async () => {
    const payable = await makeTx("PAYABLE", 4000);
    await expect(
      call(operatorCtx).financial.update({ id: payable.txId, description: "hack" }),
    ).rejects.toThrow(/contas a pagar/i);
  });

  it("A1: operador NÃO vê openCashiers nem o caixa de outro operador", async () => {
    await expect(call(operatorCtx).cashier.openCashiers()).rejects.toThrow(/gerente/i);

    // Caixa do ADMIN; operador tenta abrir o detalhe → FORBIDDEN.
    const adminSession = await prisma.cashSession.create({ data: { tenantId, userId: adminId, initialBalance: 0 } });
    sessionIds.push(adminSession.id);
    await expect(
      call(operatorCtx).cashier.byId({ id: adminSession.id }),
    ).rejects.toThrow(/permissao|permissão/i);
    // Admin vê o próprio: OK.
    await expect(call(adminCtx).cashier.byId({ id: adminSession.id })).resolves.toBeTruthy();
  });

  it("K4: gerente ajusta o caixa de um operador via sessionId", async () => {
    // Fecha sessões abertas do operador (índice único "um caixa aberto por
    // usuário") deixadas por testes anteriores, então abre uma limpa.
    await prisma.cashSession.updateMany({
      where: { userId: operatorId, closedAt: null }, data: { closedAt: new Date() },
    });
    const opSession = await prisma.cashSession.create({ data: { tenantId, userId: operatorId, initialBalance: 0 } });
    sessionIds.push(opSession.id);

    // Gerente faz ajuste apontando a sessão do operador.
    await call(adminCtx).cashier.manualAdjustment({
      amount: 1500, nature: "INCOME", reason: "correcao de conferencia", sessionId: opSession.id,
    });

    // O movimento de ajuste caiu na sessão do OPERADOR, não na do gerente.
    const mov = await prisma.cashMovement.findFirst({
      where: { cashSessionId: opSession.id, paymentMethod: "ajuste_manual" },
    });
    expect(mov).not.toBeNull();
    expect(Number(mov!.amount)).toBe(15);
  });
});
