/**
 * Auditoria Financeiro/Caixa — validação ao vivo (Postgres local, callers reais).
 * P1: dois payInstallment PARCIAIS concorrentes na mesma parcela não podem causar
 *     lost-update (dinheiro coletado sumindo do razão). CAS guarda paidAmount.
 * K3: duas sangrias concorrentes que somam > saldo → a 2ª falha (gaveta não fica
 *     negativa). Lock + revalidação.
 * P3: reverseInstallment sem caixa aberto → bloqueia (saída precisa ir pra gaveta).
 * K2: dois forceClose concorrentes na mesma sessão → exatamente um vence.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
vi.mock("@/server/auth", () => ({ auth: async () => null }));
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createCallerFactory } from "@/server/api/trpc";
import { appRouter } from "@/server/api/root";
import { withTenant } from "@/server/db";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const MARK = "fin-concurrency-test";
let ctx: any, tenantId: string, adminId: string, customerId: string;
const txIds: string[] = [];

function caller() {
  return createCallerFactory(appRouter)(ctx);
}

async function makeReceivableInstallment(amountCents: number) {
  const t = await prisma.financialTransaction.create({
    data: {
      tenantId, type: "RECEIVABLE", status: "PENDING",
      description: `${MARK}-cr`, totalAmount: amountCents / 100, dueDate: new Date(),
      customerId, createdByUserId: adminId,
      installments: { create: [{ tenantId, number: 1, amount: amountCents / 100, dueDate: new Date(), status: "PENDING" }] },
    },
    include: { installments: true },
  });
  txIds.push(t.id);
  return t.installments[0]!.id;
}

async function openCash(initialCents: number) {
  const open = await prisma.cashSession.findMany({ where: { userId: adminId, closedAt: null }, select: { id: true } });
  for (const s of open) await prisma.cashMovement.deleteMany({ where: { cashSessionId: s.id } });
  await prisma.cashSession.deleteMany({ where: { userId: adminId, closedAt: null } });
  return prisma.cashSession.create({ data: { tenantId, userId: adminId, initialBalance: initialCents / 100 } });
}

beforeAll(async () => {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "arena-tech" } });
  const admin = await prisma.user.findFirstOrThrow({ where: { name: "Admin Arena" } });
  tenantId = tenant.id; adminId = admin.id;
  ctx = {
    session: { user: { id: adminId, isSuperAdmin: false }, activeTenantId: tenantId, availableTenants: [{ id: tenantId, slug: "arena-tech", role: "admin" }] },
    tenantId, withTenant: (fn: any) => withTenant(tenantId, fn),
  };
  customerId = (await prisma.customer.create({ data: { tenantId, name: `${MARK}-cli`, phone: "11999990000" } })).id;
});

afterAll(async () => {
  const openSessions = await prisma.cashSession.findMany({ where: { userId: adminId }, select: { id: true } });
  for (const s of openSessions) await prisma.cashMovement.deleteMany({ where: { cashSessionId: s.id } });
  for (const t of txIds) {
    await prisma.installment.deleteMany({ where: { transactionId: t } });
    await prisma.financialTransaction.deleteMany({ where: { id: t } });
  }
  await prisma.cashMovement.deleteMany({ where: { createdByUserId: adminId, description: { contains: MARK } } });
  await prisma.cashSession.deleteMany({ where: { userId: adminId } });
  await prisma.customer.deleteMany({ where: { id: customerId } });
  await prisma.$disconnect();
});

describe("Auditoria Financeiro/Caixa — concorrência (ao vivo)", () => {
  it("P1: dois pagamentos parciais concorrentes não fazem lost-update (dinheiro = razão)", async () => {
    await openCash(0);
    const instId = await makeReceivableInstallment(10000); // parcela R$100
    const c = caller();

    // Duas baixas parciais de R$40 em paralelo. Sem o CAS+paidAmount, ambas
    // gravariam paidAmount=40 (lost update) mas criariam 2 CashMovement de 40.
    const results = await Promise.allSettled([
      c.financial.payInstallment({ installmentId: instId, amountPaid: 4000, paymentMethod: "dinheiro" }),
      c.financial.payInstallment({ installmentId: instId, amountPaid: 4000, paymentMethod: "dinheiro" }),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled").length;

    // Invariante-chave: o paidAmount da parcela == soma dos CashMovement de entrada.
    const inst = await prisma.installment.findUniqueOrThrow({ where: { id: instId } });
    const paidCents = Math.round(Number(inst.paidAmount) * 100);
    const movements = await prisma.cashMovement.findMany({
      where: { referenceId: instId, referenceType: "installment", nature: "INCOME" },
    });
    const movedCents = movements.reduce((s, m) => s + Math.round(Number(m.amount) * 100), 0);

    expect(paidCents).toBe(movedCents); // ← o fix P1: gaveta nunca diverge do razão
    // Ou uma venceu (paid 40, 1 movimento) ou ambas somaram (paid 80, 2 movimentos).
    expect([4000, 8000]).toContain(paidCents);
    expect(ok).toBeGreaterThanOrEqual(1);
  });

  it("K3: duas sangrias concorrentes acima do saldo → a 2ª falha (gaveta não negativa)", async () => {
    await openCash(10000); // R$100 na gaveta
    const c = caller();
    const results = await Promise.allSettled([
      c.cashier.withdrawal({ amount: 8000, description: `${MARK}-sangria A` }),
      c.cashier.withdrawal({ amount: 8000, description: `${MARK}-sangria B` }),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled").length;
    const rejected = results.filter((r) => r.status === "rejected").length;
    // R$80 + R$80 > R$100 → só uma pode passar.
    expect(ok).toBe(1);
    expect(rejected).toBe(1);

    const session = await prisma.cashSession.findFirstOrThrow({ where: { userId: adminId, closedAt: null } });
    const withdrawals = await prisma.cashMovement.count({
      where: { cashSessionId: session.id, type: "WITHDRAWAL" },
    });
    expect(withdrawals).toBe(1); // gaveta não foi a -R$60
  });

  it("P3: reverseInstallment sem caixa aberto é bloqueado", async () => {
    await openCash(0);
    const instId = await makeReceivableInstallment(5000);
    const c = caller();
    await c.financial.payInstallment({ installmentId: instId, amountPaid: 5000, paymentMethod: "dinheiro" });
    // Fecha todos os caixas do usuário.
    await prisma.cashSession.updateMany({ where: { userId: adminId, closedAt: null }, data: { closedAt: new Date() } });

    await expect(
      c.financial.reverseInstallment({ installmentId: instId, reason: "teste P3 sem caixa" }),
    ).rejects.toThrow(/[Cc]aixa nao esta aberto|[Cc]aixa não está aberto/);
  });

  it("K2: dois forceClose concorrentes na mesma sessão → um vence, um CONFLICT", async () => {
    const session = await openCash(5000);
    const c = caller();
    const results = await Promise.allSettled([
      c.cashier.forceClose({ sessionId: session.id, reason: `${MARK}-force A` }),
      c.cashier.forceClose({ sessionId: session.id, reason: `${MARK}-force B` }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
  });
});
