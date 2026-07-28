/**
 * Auditoria 2026-07-25 — item 17: tipo de serviço era texto livre.
 *
 * As operações "por tipo" (filtrar, reajustar preço em massa, renomear,
 * duplicar, excluir) casavam por IGUALDADE EXATA de string. "Troca de Tela" e
 * "troca de tela" eram dois tipos diferentes: o reajuste pegava metade dos
 * serviços, o filtro escondia a outra metade e ninguém percebia — os dois
 * aparecem na lista com o mesmo nome aos olhos de quem lê.
 *
 * Em produção não havia divergência (medido em 2026-07-27: 14 tipos, 0
 * divergindo por caixa/espaço), então o bug era latente. O primeiro operador
 * que digitasse a mesma coisa com outra caixa o ativaria.
 *
 * A entidade `ServiceType` e a FK `services.service_type_id` JÁ EXISTIAM no
 * schema desde 2026-05-16 — e estavam 100% mortas (0 linhas em produção). Esta
 * correção liga as duas pontas: resolver find-or-create deduplicando por nome
 * normalizado (espelha `findOrCreateBrandByName`), backfill do histórico e as
 * operações por tipo passando a usar o id.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
vi.mock("@/server/auth", () => ({ auth: async () => null }));
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createCallerFactory } from "@/server/api/trpc";
import { appRouter } from "@/server/api/root";
import { withTenant } from "@/server/db";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const MARK = "svc-type-entity";
let tenantId: string, adminId: string, ctx: any;

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
      availableTenants: [{ id: tenantId, slug: "arena-tech", role: "admin", modules: ["services"] }],
    },
    tenantId,
    withTenant: (fn: any) => withTenant(tenantId, fn),
  };
  await limpar();
});

afterAll(async () => {
  await limpar();
  await prisma.$disconnect();
});

/** Remove o que as rodadas (inclusive as que morreram no meio) deixaram. */
async function limpar() {
  await prisma.service.deleteMany({ where: { tenantId, name: { contains: MARK } } });
  await prisma.serviceType.deleteMany({ where: { tenantId, name: { contains: MARK } } });
}

describe("17 — tipo de serviço é entidade, não texto solto", () => {
  it("mesma grafia com caixa diferente cai no MESMO tipo", async () => {
    const c = caller();
    const a = await c.catalog.createService({
      newServiceTypeName: `${MARK} Troca de Tela`,
      deviceModel: "iPhone 15",
      basePrice: 50000,
    });
    const b = await c.catalog.createService({
      newServiceTypeName: `${MARK} troca de tela`,
      deviceModel: "iPhone 14",
      basePrice: 45000,
    });

    const sa = await prisma.service.findUniqueOrThrow({ where: { id: a.id } });
    const sb = await prisma.service.findUniqueOrThrow({ where: { id: b.id } });

    expect(sa.serviceTypeId).not.toBeNull();
    expect(sb.serviceTypeId).toBe(sa.serviceTypeId);

    // Uma entidade só — não duas quase-iguais.
    const tipos = await prisma.serviceType.count({
      where: { tenantId, name: { contains: MARK }, deletedAt: null },
    });
    expect(tipos).toBe(1);
  });

  it("reajuste em massa alcanca os servicos das DUAS grafias", async () => {
    const c = caller();
    const a = await c.catalog.createService({
      newServiceTypeName: `${MARK} Bateria`,
      deviceModel: "iPhone 13",
      basePrice: 20000,
    });
    const b = await c.catalog.createService({
      newServiceTypeName: `${MARK} BATERIA`,
      deviceModel: "iPhone 12",
      basePrice: 18000,
    });

    const tipoId = (await prisma.service.findUniqueOrThrow({ where: { id: a.id } })).serviceTypeId!;
    const res = await c.catalog.bulkAdjustPrice({ serviceTypeId: tipoId, adjustmentCents: 5000 });
    expect(res.updated).toBe(2);

    const [sa, sb] = await Promise.all([
      prisma.service.findUniqueOrThrow({ where: { id: a.id } }),
      prisma.service.findUniqueOrThrow({ where: { id: b.id } }),
    ]);
    expect(Number(sa.basePrice)).toBe(250);
    expect(Number(sb.basePrice)).toBe(230);
  });

  it("renomear o tipo renomeia os servicos das duas grafias de uma vez", async () => {
    const c = caller();
    const a = await c.catalog.createService({
      newServiceTypeName: `${MARK} Alto Falante`,
      deviceModel: "Galaxy S23",
      basePrice: 12000,
    });
    await c.catalog.createService({
      newServiceTypeName: `${MARK} alto falante`,
      deviceModel: "Galaxy S22",
      basePrice: 11000,
    });

    const tipoId = (await prisma.service.findUniqueOrThrow({ where: { id: a.id } })).serviceTypeId!;
    const res = await c.catalog.renameServiceType({ id: tipoId, newName: `${MARK} Auto Falante` });
    expect(res.updated).toBe(2);

    const servicos = await prisma.service.findMany({ where: { serviceTypeId: tipoId, deletedAt: null } });
    expect(servicos).toHaveLength(2);
    for (const s of servicos) {
      expect(s.serviceType).toBe(`${MARK} Auto Falante`);
      expect(s.name.startsWith(`${MARK} Auto Falante - `)).toBe(true);
    }
  });

  it("filtrar por tipo devolve as duas grafias", async () => {
    const c = caller();
    const a = await c.catalog.createService({
      newServiceTypeName: `${MARK} Camera`,
      deviceModel: "Moto G84",
      basePrice: 9000,
    });
    await c.catalog.createService({
      newServiceTypeName: `${MARK} CÂMERA`,
      deviceModel: "Moto G54",
      basePrice: 8000,
    });

    const tipoId = (await prisma.service.findUniqueOrThrow({ where: { id: a.id } })).serviceTypeId!;
    const lista = await c.catalog.listServices({ serviceTypeId: tipoId });
    expect(lista.total).toBe(2);
  });

  it("excluir o tipo leva junto os servicos das duas grafias", async () => {
    const c = caller();
    const a = await c.catalog.createService({
      newServiceTypeName: `${MARK} Conector`,
      deviceModel: "iPhone 11",
      basePrice: 15000,
    });
    await c.catalog.createService({
      newServiceTypeName: `${MARK} conector`,
      deviceModel: "iPhone X",
      basePrice: 14000,
    });

    const tipoId = (await prisma.service.findUniqueOrThrow({ where: { id: a.id } })).serviceTypeId!;
    await c.catalog.deleteServiceType({ id: tipoId });

    const vivos = await prisma.service.count({ where: { serviceTypeId: tipoId, deletedAt: null } });
    expect(vivos).toBe(0);
    const tipo = await prisma.serviceType.findUniqueOrThrow({ where: { id: tipoId } });
    expect(tipo.deletedAt).not.toBeNull();
  });

  it("duplicar um SERVICO mantem o mesmo tipo (nao inventa tipo novo)", async () => {
    const c = caller();
    const original = await c.catalog.createService({
      newServiceTypeName: `${MARK} Microfone`,
      deviceModel: "Redmi Note 12",
      basePrice: 7000,
    });
    const tipoId = (await prisma.service.findUniqueOrThrow({ where: { id: original.id } })).serviceTypeId!;

    const copia = await c.catalog.duplicateService({ id: original.id });
    const s = await prisma.service.findUniqueOrThrow({ where: { id: copia.id } });

    expect(s.serviceTypeId).toBe(tipoId);
    // A sombra continua batendo com a entidade — nada de "X (cópia)" como tipo.
    const tipo = await prisma.serviceType.findUniqueOrThrow({ where: { id: tipoId } });
    expect(s.serviceType).toBe(tipo.name);
    expect(s.deviceModel).toContain("(cópia)");

    const tipos = await prisma.serviceType.count({
      where: { tenantId, name: { contains: `${MARK} Microfone` }, deletedAt: null },
    });
    expect(tipos).toBe(1);
  });

  it("duplicar o TIPO cria uma entidade nova com os servicos copiados", async () => {
    const c = caller();
    const a = await c.catalog.createService({
      newServiceTypeName: `${MARK} Vidro`,
      deviceModel: "iPhone 15",
      basePrice: 30000,
    });
    await c.catalog.createService({
      newServiceTypeName: `${MARK} VIDRO`,
      deviceModel: "iPhone 14",
      basePrice: 28000,
    });
    const tipoId = (await prisma.service.findUniqueOrThrow({ where: { id: a.id } })).serviceTypeId!;

    const res = await c.catalog.duplicateServiceType({
      sourceId: tipoId,
      newName: `${MARK} Vidro Premium`,
    });
    expect(res.copiedCount).toBe(2);
    expect(res.type.id).not.toBe(tipoId);

    const copiados = await prisma.service.findMany({
      where: { serviceTypeId: res.type.id, deletedAt: null },
    });
    expect(copiados).toHaveLength(2);
    for (const s of copiados) {
      expect(s.serviceType).toBe(`${MARK} Vidro Premium`);
    }
  });

  it("recriar um tipo apagado revive a entidade (nao estoura a unique do slug)", async () => {
    const c = caller();
    const a = await c.catalog.createService({
      newServiceTypeName: `${MARK} Placa`,
      deviceModel: "iPhone 12",
      basePrice: 60000,
    });
    const tipoId = (await prisma.service.findUniqueOrThrow({ where: { id: a.id } })).serviceTypeId!;
    await c.catalog.deleteServiceType({ id: tipoId });

    const b = await c.catalog.createService({
      newServiceTypeName: `${MARK} placa`,
      deviceModel: "iPhone 13",
      basePrice: 65000,
    });
    const revivido = await prisma.service.findUniqueOrThrow({ where: { id: b.id } });
    expect(revivido.serviceTypeId).toBe(tipoId);

    const tipo = await prisma.serviceType.findUniqueOrThrow({ where: { id: tipoId } });
    expect(tipo.deletedAt).toBeNull();
  });
});
