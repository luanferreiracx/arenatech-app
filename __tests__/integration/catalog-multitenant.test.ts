/**
 * Catálogo multi-tenant por slug (ao vivo). getPublicCatalog({tenantSlug})
 * retorna SÓ os produtos do tenant do slug — antes era single-tenant (env var).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/server/auth", () => ({ auth: async () => null }));
import { Prisma } from "@prisma/client";
import { withAdmin } from "@/server/db";
import { getPublicCatalog } from "@/server/services/public-catalog";

const MARK = "cat-mt-test";
const ts = Date.now();
const t1Slug = `${MARK}-t1-${ts}`;
const t2Slug = `${MARK}-t2-${ts}`;
const suspSlug = `${MARK}-susp-${ts}`;
const tenantIds: string[] = [];
const productIds: string[] = [];

beforeAll(async () => {
  await withAdmin(async (tx: any) => {
    const mk = async (slug: string, status: "ACTIVE" | "SUSPENDED", label: string) => {
      const t = await tx.tenant.create({ data: { slug, name: `${MARK} ${label}`, status } });
      tenantIds.push(t.id);
      const p = await tx.product.create({
        data: {
          tenantId: t.id, name: `${MARK}-prod-${label}`, salePrice: new Prisma.Decimal(100),
          costPrice: new Prisma.Decimal(50), currentStock: 5, active: true, isDevice: false,
          isSerialized: false, hasVariations: false, imageUrl: "https://x/p.png",
        },
      });
      productIds.push(p.id);
    };
    await mk(t1Slug, "ACTIVE", "loja1");
    await mk(t2Slug, "ACTIVE", "loja2");
    await mk(suspSlug, "SUSPENDED", "susp");
  });
});

afterAll(async () => {
  await withAdmin(async (tx: any) => {
    await tx.product.deleteMany({ where: { id: { in: productIds } } });
    await tx.tenant.deleteMany({ where: { id: { in: tenantIds } } });
  });
});

describe("Catálogo multi-tenant (ao vivo)", () => {
  it("cada slug vê APENAS os produtos do seu tenant", async () => {
    const cat1 = await getPublicCatalog({ tenantSlug: t1Slug });
    const cat2 = await getPublicCatalog({ tenantSlug: t2Slug });

    const names1 = cat1.products.map((p) => p.name);
    const names2 = cat2.products.map((p) => p.name);

    expect(names1).toContain(`${MARK}-prod-loja1`);
    expect(names1).not.toContain(`${MARK}-prod-loja2`);
    expect(names2).toContain(`${MARK}-prod-loja2`);
    expect(names2).not.toContain(`${MARK}-prod-loja1`);
  });

  it("slug inexistente → catálogo vazio (não vaza o default)", async () => {
    const cat = await getPublicCatalog({ tenantSlug: `${MARK}-nao-existe-${ts}` });
    expect(cat.products.length).toBe(0);
    expect(cat.total).toBe(0);
  });

  it("tenant SUSPENDED → catálogo vazio", async () => {
    const cat = await getPublicCatalog({ tenantSlug: suspSlug });
    expect(cat.products.length).toBe(0);
  });
});
