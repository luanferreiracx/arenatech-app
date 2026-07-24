/**
 * C5 — editar valor/vencimento/parcelas de uma conta PENDENTE (financial.update):
 * regenera as parcelas; bloqueia quando já há pagamento.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
vi.mock("@/server/auth", () => ({ auth: async () => null }));
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createCallerFactory } from "@/server/api/trpc";
import { appRouter } from "@/server/api/root";
import { withTenant } from "@/server/db";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
let tenantId: string, adminId: string, adminCtx: any;
const txIds: string[] = [];
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
  await prisma.installmentPayment.deleteMany({ where: { transactionId: { in: txIds } } });
  await prisma.installment.deleteMany({ where: { transactionId: { in: txIds } } });
  await prisma.financialTransaction.deleteMany({ where: { id: { in: txIds } } });
  await prisma.$disconnect();
});

async function makeReceivable(totalCents: number, numInstallments: number) {
  const created = await call(adminCtx).financial.create({
    type: "RECEIVABLE",
    description: "conta edit-value",
    totalAmount: totalCents,
    numInstallments,
    emissionDate: new Date().toISOString(),
    firstDueDate: "2026-08-10",
  });
  txIds.push(created.id);
  return created.id;
}

describe("C5 — editar valor de conta pendente", () => {
  it("edita valor e parcelas: regenera as parcelas e atualiza o total", async () => {
    const id = await makeReceivable(150000, 1); // R$1500 (digitou errado)

    await call(adminCtx).financial.update({
      id,
      description: "conta edit-value",
      totalAmount: 15000, // corrige para R$150
      numInstallments: 3,
    });

    const tx = await prisma.financialTransaction.findUniqueOrThrow({
      where: { id },
      include: { installments: { orderBy: { number: "asc" } } },
    });
    expect(Number(tx.totalAmount)).toBe(150);
    expect(tx.installmentsTotal).toBe(3);
    expect(tx.installments).toHaveLength(3);
    const sum = tx.installments.reduce((s, i) => s + Number(i.amount), 0);
    expect(sum).toBeCloseTo(150, 2);
  });

  it("bloqueia edição de valor quando já há pagamento", async () => {
    const id = await makeReceivable(10000, 1);
    const inst = await prisma.installment.findFirstOrThrow({ where: { transactionId: id } });
    // Paga METADE → conta fica PARTIALLY_PAID (não PENDING) → minha guarda bloqueia.
    await call(adminCtx).financial.payInstallment({
      installmentId: inst.id,
      amountPaid: 5000,
      paymentMethod: "dinheiro",
    });

    await expect(
      call(adminCtx).financial.update({ id, description: "x", totalAmount: 5000 }),
    ).rejects.toThrow(/pendente sem pagamento|pagamento registrado/i);
  });
});
