/**
 * R4 (auditoria comissão 2026-07-11, ao vivo): recebível PENDING cuja data
 * esperada de liquidação já passou é sinalizado como vencido — na linha
 * (`isOverdue`) e no agregado do resumo (`overdueCount`/`overdueNetCents`),
 * contando TODO o filtro, não só a página.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
vi.mock("@/server/auth", () => ({ auth: async () => null }));
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createCallerFactory } from "@/server/api/trpc";
import { appRouter } from "@/server/api/root";
import { withTenant } from "@/server/db";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const MARK = "r4-overdue-test";
let tenantId: string, adminId: string, ctx: any, acquirerId: string, brandId: string;
const crs: string[] = [];

const call = (c: any) => createCallerFactory(appRouter)(c);

beforeAll(async () => {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "arena-tech" } });
  const admin = await prisma.user.findFirstOrThrow({ where: { name: "Admin Arena" } });
  tenantId = tenant.id; adminId = admin.id;
  ctx = { session: { user: { id: adminId, isSuperAdmin: false }, activeTenantId: tenantId, availableTenants: [{ id: tenantId, slug: "arena-tech", role: "admin" }] }, tenantId, withTenant: (fn: any) => withTenant(tenantId, fn) };

  acquirerId = (await prisma.acquirer.create({ data: { tenantId, name: `${MARK}-acq`, active: true } })).id;
  brandId = (await prisma.cardBrand.create({ data: { tenantId, name: `${MARK}-visa`, active: true } })).id;

  const past = new Date(Date.now() - 10 * 864e5); // 10 dias atrás → VENCIDO
  const future = new Date(Date.now() + 30 * 864e5); // 30 dias à frente → OK

  // 2 vencidos (PENDING, esperado no passado): net 97 + 194 = 291
  crs.push((await prisma.cardReceivable.create({ data: { tenantId, acquirerId, cardBrandId: brandId, kind: "CREDIT" as any, installmentNumber: 1, installmentsTotal: 1, grossAmount: 100, feeAmount: 3, netAmount: 97, expectedSettlementDate: past, status: "PENDING" as any } })).id);
  crs.push((await prisma.cardReceivable.create({ data: { tenantId, acquirerId, cardBrandId: brandId, kind: "CREDIT" as any, installmentNumber: 1, installmentsTotal: 1, grossAmount: 200, feeAmount: 6, netAmount: 194, expectedSettlementDate: past, status: "PENDING" as any } })).id);
  // 1 no prazo (PENDING futuro) → NÃO vencido
  crs.push((await prisma.cardReceivable.create({ data: { tenantId, acquirerId, cardBrandId: brandId, kind: "CREDIT" as any, installmentNumber: 1, installmentsTotal: 1, grossAmount: 50, feeAmount: 1, netAmount: 49, expectedSettlementDate: future, status: "PENDING" as any } })).id);
  // 1 vencido MAS já liquidado (SETTLED) → NÃO conta como vencido
  crs.push((await prisma.cardReceivable.create({ data: { tenantId, acquirerId, cardBrandId: brandId, kind: "CREDIT" as any, installmentNumber: 1, installmentsTotal: 1, grossAmount: 100, feeAmount: 3, netAmount: 97, expectedSettlementDate: past, status: "SETTLED" as any, settledAt: new Date(), settledNetAmount: 97 } })).id);
});

afterAll(async () => {
  await prisma.cardReceivable.deleteMany({ where: { id: { in: crs } } });
  await prisma.acquirerRate.deleteMany({ where: { acquirerId } });
  await prisma.cardBrand.deleteMany({ where: { id: brandId } });
  await prisma.acquirer.deleteMany({ where: { id: acquirerId } });
  await prisma.$disconnect();
});

describe("R4 — recebível vencido sinalizado (ao vivo)", () => {
  it("marca isOverdue por linha e agrega overdueCount/overdueNetCents", async () => {
    // Filtro PENDING (default): 2 vencidos + 1 no prazo. O SETTLED não entra.
    const pending = await call(ctx).receiving.cardReceivables.list({ acquirerId, page: 0, pageSize: 100 });
    const mine = pending.data.filter((r) => crs.includes(r.id));
    expect(mine.length).toBe(3); // 2 vencidos + 1 no prazo
    expect(mine.filter((r) => r.isOverdue).length).toBe(2); // os 2 no passado
    expect(mine.filter((r) => !r.isOverdue).length).toBe(1); // o futuro

    // Agregado do resumo (cross-página, filtrado por este adquirente).
    expect(pending.summary.overdueCount).toBe(2);
    expect(pending.summary.overdueNetCents).toBe(29100); // 97 + 194 = 291,00

    // Filtro SETTLED: o vencido-mas-liquidado NÃO é sinalizado como vencido.
    const settled = await call(ctx).receiving.cardReceivables.list({ acquirerId, status: "SETTLED", page: 0, pageSize: 100 });
    const settledMine = settled.data.filter((r) => crs.includes(r.id));
    expect(settledMine.length).toBe(1);
    expect(settledMine.every((r) => r.isOverdue === false)).toBe(true);
    expect(settled.summary.overdueCount).toBe(0);
  });
});
