/**
 * Resolução de marca no cadastro (A1): find-or-create deduplicado.
 *
 * Prova que resolveBrandId reusa a marca existente por nome normalizado (não
 * recria "ASUS" quando já há "Asus"), respeita a seleção por id, cria inline, e
 * cai no texto legado. É a rede que impede o texto livre de voltar a sujar a base.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { resolveBrandId, findOrCreateBrandByName } from "@/server/services/product-brand.service";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const suffix = Date.now().toString(36);
let tenantId: string;
let asusId: string;

beforeAll(async () => {
  const t = await prisma.tenant.create({ data: { name: `BR ${suffix}`, slug: `br-${suffix}`, status: "ACTIVE" } });
  tenantId = t.id;
  const asus = await prisma.productBrand.create({ data: { tenantId, name: "Asus" } });
  asusId = asus.id;
});

afterAll(async () => {
  await prisma.productBrand.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.$disconnect();
});

describe("resolveBrandId", () => {
  it("marca selecionada por id vence", async () => {
    const r = await resolveBrandId(prisma, tenantId, { brandId: asusId });
    expect(r.brandId).toBe(asusId);
    expect(r.brandName).toBe("Asus");
  });

  it("newBrandName com nome equivalente REUSA a marca existente (não duplica)", async () => {
    const r = await resolveBrandId(prisma, tenantId, { newBrandName: "ASUS" });
    expect(r.brandId).toBe(asusId); // reusou "Asus", não criou "ASUS"
    const count = await prisma.productBrand.count({ where: { tenantId } });
    expect(count).toBe(1);
  });

  it("texto legado (brand) também resolve por dedup", async () => {
    const r = await resolveBrandId(prisma, tenantId, { brand: "  asus " });
    expect(r.brandId).toBe(asusId);
  });

  it("newBrandName inédito cria uma marca nova", async () => {
    const r = await resolveBrandId(prisma, tenantId, { newBrandName: "Samsung" });
    expect(r.brandName).toBe("Samsung");
    expect(r.brandId).not.toBe(asusId);
  });

  it("sem nenhuma entrada de marca → null", async () => {
    const r = await resolveBrandId(prisma, tenantId, {});
    expect(r.brandId).toBeNull();
    expect(r.brandName).toBeNull();
  });

  it("findOrCreateBrandByName é idempotente para o mesmo nome normalizado", async () => {
    const a = await findOrCreateBrandByName(prisma, tenantId, "Xiaomi");
    const b = await findOrCreateBrandByName(prisma, tenantId, "XIAOMI ");
    expect(b.brandId).toBe(a.brandId);
  });
});
