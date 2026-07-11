/**
 * Auditoria Comissão/Recebimento — C2/R1/A1 (ao vivo).
 * C2: closeApuracao RECOMPUTA antes de gerar o PAYABLE — o valor stale gravado
 *     no banco é ignorado; o payable reflete o estado atual das vendas.
 * R1: dois settle concorrentes no mesmo recebível → 1 liquidação (CAS), sem
 *     double-count.
 * A1: operador NÃO concilia (settle virou admin).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
vi.mock("@/server/auth", () => ({ auth: async () => null }));
import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createCallerFactory } from "@/server/api/trpc";
import { appRouter } from "@/server/api/root";
import { withTenant } from "@/server/db";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const MARK = "comm-c2-test";
let tenantId: string, adminId: string, operatorId: string, adminCtx: any, operatorCtx: any;
let productId: string, providerId: string, contractId: string;
const cleanup = { sales: [] as string[], apuracaoIds: [] as string[], fts: [] as string[], crs: [] as string[], sessions: [] as string[], acquirerId: "", brandId: "" };
const now = new Date();
const YEAR = now.getFullYear(), MONTH = now.getMonth() + 1;

const call = (c: any) => createCallerFactory(appRouter)(c);
function mkCtx(userId: string, role: string) {
  return { session: { user: { id: userId, isSuperAdmin: false }, activeTenantId: tenantId, availableTenants: [{ id: tenantId, slug: "arena-tech", role }] }, tenantId, withTenant: (fn: any) => withTenant(tenantId, fn) };
}

beforeAll(async () => {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "arena-tech" } });
  const admin = await prisma.user.findFirstOrThrow({ where: { name: "Admin Arena" } });
  const operator = await prisma.user.findFirstOrThrow({ where: { name: "Operador Arena" } });
  tenantId = tenant.id; adminId = admin.id; operatorId = operator.id;
  adminCtx = mkCtx(adminId, "admin"); operatorCtx = mkCtx(operatorId, "operator");

  productId = (await prisma.product.create({ data: { tenantId, name: `${MARK}-acessorio`, salePrice: 1000, costPrice: 600, currentStock: 100, isDevice: false, isPremium: false, isSerialized: false, hasVariations: false, active: true } })).id;
  // Prestador = o admin (a venda com sellerId=adminId conta como OWN).
  const provider = await prisma.provider.create({ data: { tenantId, userId: adminId, profile: "SELLER" as any } });
  providerId = provider.id;
  contractId = (await prisma.providerContract.create({ data: { tenantId, providerId, startDate: new Date(YEAR, 0, 1) } })).id;
  await prisma.providerCommissionRule.create({ data: { tenantId, contractId, category: "produto_acessorio", scope: "normal", valueType: "PERCENT", base: "PROFIT", source: "OWN", rangeMin: new Prisma.Decimal(0), rangeMax: null, rate: new Prisma.Decimal(10) } });
});

afterAll(async () => {
  await prisma.providerCommissionRule.deleteMany({ where: { contractId } });
  await prisma.providerContract.deleteMany({ where: { id: contractId } });
  await prisma.installment.deleteMany({ where: { transactionId: { in: cleanup.fts } } });
  await prisma.financialTransaction.deleteMany({ where: { referenceType: "provider_apuracao", referenceId: { in: cleanup.apuracaoIds } } });
  await prisma.providerApuracao.deleteMany({ where: { providerId } });
  await prisma.provider.deleteMany({ where: { id: providerId } });
  for (const sid of cleanup.sales) { await prisma.saleItem.deleteMany({ where: { saleId: sid } }); await prisma.sale.deleteMany({ where: { id: sid } }); }
  for (const s of cleanup.sessions) await prisma.cashMovement.deleteMany({ where: { cashSessionId: s } });
  await prisma.cashSession.deleteMany({ where: { id: { in: cleanup.sessions } } });
  await prisma.cardReceivable.deleteMany({ where: { id: { in: cleanup.crs } } });
  if (cleanup.acquirerId) await prisma.acquirerRate.deleteMany({ where: { acquirerId: cleanup.acquirerId } });
  if (cleanup.brandId) await prisma.cardBrand.deleteMany({ where: { id: cleanup.brandId } });
  if (cleanup.acquirerId) await prisma.acquirer.deleteMany({ where: { id: cleanup.acquirerId } });
  await prisma.product.deleteMany({ where: { id: productId } });
  await prisma.$disconnect();
});

async function makeSale() {
  const sale = await prisma.sale.create({
    data: { tenantId, number: `${MARK}-${Date.now()}-${Math.random()}`, sellerId: adminId, publicLink: `${MARK}-l-${Date.now()}-${Math.random()}`, status: "COMPLETED" as any, saleDate: new Date(), subtotal: 1000, totalAmount: 1000, paidAmount: 1000, isOSPayment: false,
      items: { create: [{ tenantId, productId, description: `${MARK}-item`, quantity: 1, unitPrice: 1000, costPrice: 600, discount: 0, total: 1000 }] } },
  });
  cleanup.sales.push(sale.id);
  return sale.id;
}

describe("Auditoria Comissão/Recebimento — C2/R1/A1 (ao vivo)", () => {
  it("C2: closeApuracao recomputa (ignora netAmount stale) e o PAYABLE reflete o estado atual", async () => {
    await makeSale(); // LBC 400 → comissão 10% = 40
    const c = call(adminCtx);
    const calc = await c.providerCommission.calculate({ providerId, year: YEAR, month: MONTH });
    cleanup.apuracaoIds.push(calc.id);
    expect(calc.netAmount).toBe(40);

    // Corrompe o netAmount gravado (simula stale — vendas mudaram desde o calculate).
    await prisma.providerApuracao.update({ where: { id: calc.id }, data: { netAmount: new Prisma.Decimal(999.99) } });

    await c.providerCommission.closeApuracao({ providerId, year: YEAR, month: MONTH });

    // Recomputado: apuração volta a 40 (não 999.99), e o PAYABLE é de 40.
    const apAfter = await prisma.providerApuracao.findUniqueOrThrow({ where: { id: calc.id } });
    expect(Number(apAfter.netAmount)).toBe(40);
    expect(apAfter.status).toBe("CLOSED");
    const ft = await prisma.financialTransaction.findFirstOrThrow({ where: { referenceType: "provider_apuracao", referenceId: calc.id } });
    cleanup.fts.push(ft.id);
    expect(Number(ft.totalAmount)).toBe(40); // ← C2: valor fresco, não o stale 999,99
  });

  it("A1: operador NÃO concilia recebível (settle virou admin)", async () => {
    const session = await prisma.cashSession.create({ data: { tenantId, userId: adminId, initialBalance: 0 } });
    cleanup.sessions.push(session.id);
    cleanup.acquirerId = (await prisma.acquirer.create({ data: { tenantId, name: `${MARK}-acq`, active: true } })).id;
    cleanup.brandId = (await prisma.cardBrand.create({ data: { tenantId, name: `${MARK}-visa`, active: true } })).id;
    const cr = await prisma.cardReceivable.create({ data: { tenantId, acquirerId: cleanup.acquirerId, cardBrandId: cleanup.brandId, kind: "CREDIT" as any, installmentNumber: 1, installmentsTotal: 1, grossAmount: 100, feeAmount: 3, netAmount: 97, expectedSettlementDate: new Date(Date.now() + 30 * 864e5), status: "PENDING" as any } });
    cleanup.crs.push(cr.id);

    await expect(
      call(operatorCtx).receiving.cardReceivables.settle({ items: [{ id: cr.id, settledNetCents: 9700 }] }),
    ).rejects.toThrow();

    // R1: admin concilia, e uma 2ª liquidação concorrente não conta em dobro.
    const results = await Promise.allSettled([
      call(adminCtx).receiving.cardReceivables.settle({ items: [{ id: cr.id, settledNetCents: 9700 }] }),
      call(adminCtx).receiving.cardReceivables.settle({ items: [{ id: cr.id, settledNetCents: 9700 }] }),
    ]);
    const totalSettled = results.filter((r) => r.status === "fulfilled").reduce((s, r: any) => s + (r.value?.settledCount ?? 0), 0);
    expect(totalSettled).toBe(1); // exatamente 1 liquidação contabilizada (CAS)
    const crAfter = await prisma.cardReceivable.findUniqueOrThrow({ where: { id: cr.id } });
    expect(crAfter.status).toBe("SETTLED");
  });
});
