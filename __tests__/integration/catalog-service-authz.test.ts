/**
 * Auditoria 2026-07-25 — catálogo de serviços sem gate de admin nem teto.
 *
 * `bulkAdjustPrice` era `tenantProcedure` puro, com `adjustmentCents:
 * z.number().int()` SEM `.min()`/`.max()`, e sem `logAudit`. Um operador
 * reajustava TODOS os serviços de um tipo, em qualquer valor, sem deixar
 * rastro. O preço do serviço é a base da OS e da comissão do prestador, e vai
 * no orçamento enviado ao cliente por WhatsApp/PDF — a loja fica presa ao valor
 * que mandou.
 *
 * A irmã `bulkAdjustPrices` (percentual) já tinha os dois guards
 * (`isTenantAdmin` + `.min(-100).max(1000)`) — a proteção existia no repo e não
 * foi aplicada aqui.
 *
 * `deleteByType` tinha a lógica INVERTIDA em relação ao `deleteService`:
 * apagar UM serviço exigia admin; apagar N de uma vez, não.
 *
 * 2026-07-27 (item 17): as operações por tipo passaram a ser identificadas pelo
 * ID da entidade `ServiceType`, não pelo texto. Os guards testados aqui são os
 * mesmos — mudou só como o tipo é endereçado. `deleteByType` virou
 * `deleteServiceType`.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
vi.mock("@/server/auth", () => ({ auth: async () => null }));
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createCallerFactory } from "@/server/api/trpc";
import { appRouter } from "@/server/api/root";
import { withTenant } from "@/server/db";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const MARK = "catalog-authz";
const TIPO = `${MARK}-tipo`;
let tenantId: string, adminId: string, operatorId: string, tipoId: string;
const serviceIds: string[] = [];

function mkCtx(userId: string, role: "admin" | "operator") {
  return {
    session: {
      user: { id: userId, isSuperAdmin: false },
      activeTenantId: tenantId,
      availableTenants: [{ id: tenantId, slug: "arena-tech", role, modules: ["service-orders", "stock"] }],
    },
    tenantId,
    withTenant: (fn: any) => withTenant(tenantId, fn),
  } as any;
}
const call = (ctx: any) => createCallerFactory(appRouter)(ctx);

beforeAll(async () => {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "arena-tech" } });
  const admin = await prisma.user.findFirstOrThrow({ where: { name: "Admin Arena" } });
  const operator = await prisma.user.findFirstOrThrow({ where: { name: "Operador Arena" } });
  tenantId = tenant.id;
  adminId = admin.id;
  operatorId = operator.id;
  tipoId = (
    await prisma.serviceType.upsert({
      where: { tenantId_slug: { tenantId, slug: TIPO } },
      update: { deletedAt: null },
      create: { tenantId, name: TIPO, slug: TIPO },
      select: { id: true },
    })
  ).id;
});

afterAll(async () => {
  await prisma.service.deleteMany({ where: { tenantId, serviceTypeId: tipoId } });
  await prisma.serviceType.deleteMany({ where: { tenantId, slug: TIPO } });
  await prisma.$disconnect();
});

/** Dois serviços do mesmo tipo, a R$100 cada. */
async function semeiaServicos() {
  await prisma.service.deleteMany({ where: { tenantId, serviceTypeId: tipoId } });
  await prisma.serviceType.updateMany({ where: { id: tipoId }, data: { deletedAt: null } });
  for (const n of ["A", "B"]) {
    const s = await prisma.service.create({
      data: {
        tenantId,
        name: `${MARK}-${n}`,
        serviceTypeId: tipoId,
        serviceType: TIPO,
        basePrice: 100,
        active: true,
      },
    });
    serviceIds.push(s.id);
  }
}

async function precos() {
  const lista = await prisma.service.findMany({
    where: { tenantId, serviceTypeId: tipoId, deletedAt: null },
    orderBy: { name: "asc" },
  });
  return lista.map((s) => Number(s.basePrice));
}

describe("catálogo de serviços — reajuste e exclusão em massa são de admin", () => {
  it("operador NÃO reajusta o preço de todos os serviços do tipo", async () => {
    await semeiaServicos();

    await expect(
      call(mkCtx(operatorId, "operator")).catalog.bulkAdjustPrice({
        serviceTypeId: tipoId,
        adjustmentCents: 5000,
      }),
    ).rejects.toThrow(/permiss/i);

    expect(await precos()).toEqual([100, 100]); // nada mudou
  });

  it("admin reajusta normalmente", async () => {
    await semeiaServicos();

    const r = await call(mkCtx(adminId, "admin")).catalog.bulkAdjustPrice({
      serviceTypeId: tipoId,
      adjustmentCents: 5000, // +R$50
    });

    expect(r.updated).toBe(2);
    expect(await precos()).toEqual([150, 150]);
  });

  it("reajuste absurdo é recusado pelo teto (dedo errado não vira R$ 1 milhão)", async () => {
    await semeiaServicos();

    await expect(
      call(mkCtx(adminId, "admin")).catalog.bulkAdjustPrice({
        serviceTypeId: tipoId,
        adjustmentCents: 100_000_000, // R$ 1.000.000
      }),
    ).rejects.toThrow();

    expect(await precos()).toEqual([100, 100]);
  });

  it("operador NÃO apaga todos os serviços de um tipo", async () => {
    await semeiaServicos();

    await expect(
      call(mkCtx(operatorId, "operator")).catalog.deleteServiceType({ id: tipoId }),
    ).rejects.toThrow(/permiss/i);

    expect((await precos()).length).toBe(2);
  });
});
