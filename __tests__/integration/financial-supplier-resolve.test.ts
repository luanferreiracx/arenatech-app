/**
 * Resolução de fornecedor na conta a pagar (auditoria 2026-07-13, D1/#2):
 * find-or-create deduplicado. Prova que resolveSupplierId reusa a entidade
 * existente por nome normalizado (não recria "FORNECEDOR X" quando há "Fornecedor
 * x"), respeita a seleção por id, cria inline e cai no texto legado — impede o
 * texto livre de voltar a sujar o DRE por fornecedor.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { resolveSupplierId, findOrCreateSupplierByName } from "@/server/services/financial-supplier.service";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const suffix = Date.now().toString(36);
let tenantId: string;
let acmeId: string;
const createdSupplierIds: string[] = [];

beforeAll(async () => {
  const t = await prisma.tenant.create({ data: { name: `Sup ${suffix}`, slug: `sup-${suffix}`, status: "ACTIVE" } });
  tenantId = t.id;
  const acme = await prisma.supplier.create({ data: { tenantId, type: "PJ", name: "Acme Distribuidora" } });
  acmeId = acme.id;
  createdSupplierIds.push(acmeId);
});

afterAll(async () => {
  await prisma.supplier.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.$disconnect();
});

describe("resolveSupplierId", () => {
  it("fornecedor selecionado por id vence", async () => {
    const r = await resolveSupplierId(prisma, tenantId, { supplierId: acmeId });
    expect(r.supplierId).toBe(acmeId);
    expect(r.supplierName).toBe("Acme Distribuidora");
  });

  it("newSupplierName equivalente REUSA o existente (não duplica)", async () => {
    const r = await resolveSupplierId(prisma, tenantId, { newSupplierName: "ACME DISTRIBUIDORA" });
    expect(r.supplierId).toBe(acmeId);
    const count = await prisma.supplier.count({ where: { tenantId } });
    expect(count).toBe(1);
  });

  it("texto legado (supplier) resolve por dedup, ignorando caixa/espaço", async () => {
    const r = await resolveSupplierId(prisma, tenantId, { supplier: "  acme distribuidora " });
    expect(r.supplierId).toBe(acmeId);
  });

  it("newSupplierName inédito cria um fornecedor novo", async () => {
    const r = await resolveSupplierId(prisma, tenantId, { newSupplierName: "Beta Peças" });
    expect(r.supplierName).toBe("Beta Peças");
    expect(r.supplierId).not.toBe(acmeId);
    if (r.supplierId) createdSupplierIds.push(r.supplierId);
  });

  it("sem nenhuma entrada → null", async () => {
    const r = await resolveSupplierId(prisma, tenantId, {});
    expect(r.supplierId).toBeNull();
  });

  it("findOrCreateSupplierByName é idempotente para o mesmo nome normalizado", async () => {
    const a = await findOrCreateSupplierByName(prisma, tenantId, "Gamma Ltda");
    const b = await findOrCreateSupplierByName(prisma, tenantId, "GAMMA LTDA ");
    expect(b.supplierId).toBe(a.supplierId);
  });
});
