/**
 * Busca de produto sem acento + nome em caixa alta + gestão de marcas (ao vivo).
 *
 * Regressão dos três defeitos relatados pelo dono em 2026-08-01:
 *   1. não havia tela nem procedure para gerenciar marcas;
 *   2. o nome do produto era gravado como o operador digitasse;
 *   3. buscar "pelicula" não achava "PELÍCULA" — a busca ignorava caixa, não acento.
 *
 * O teste roda contra o Postgres de verdade porque o miolo da correção é do
 * banco: a coluna derivada `search_name` e o trigger que a mantém. Um mock de
 * Prisma provaria só que o código chama o filtro, não que ele acha o produto.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
vi.mock("@/server/auth", () => ({ auth: async () => null }));
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createCallerFactory } from "@/server/api/trpc";
import { appRouter } from "@/server/api/root";
import { withTenant } from "@/server/db";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

const MARK = `busca-acento-${Date.now().toString(36)}`;

let tenantId: string;
let adminCtx: ReturnType<typeof mkCtx>;
let operatorCtx: ReturnType<typeof mkCtx>;

const call = (ctx: ReturnType<typeof mkCtx>) => createCallerFactory(appRouter)(ctx);

function mkCtx(userId: string, role: string) {
  return {
    session: {
      user: { id: userId, isSuperAdmin: false },
      activeTenantId: tenantId,
      availableTenants: [{ id: tenantId, slug: "arena-tech", role }],
    },
    tenantId,
    withTenant: (fn: Parameters<typeof withTenant>[1]) => withTenant(tenantId, fn),
  // O contexto do tRPC carrega mais campos (headers, db); o caller só usa estes.
  } as unknown as Parameters<ReturnType<typeof createCallerFactory<typeof appRouter>>>[0];
}

beforeAll(async () => {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "arena-tech" } });
  const admin = await prisma.user.findFirstOrThrow({ where: { name: "Admin Arena" } });
  const operator = await prisma.user.findFirstOrThrow({ where: { name: "Operador Arena" } });
  tenantId = tenant.id;
  adminCtx = mkCtx(admin.id, "admin");
  operatorCtx = mkCtx(operator.id, "operator");
});

afterAll(async () => {
  await prisma.product.deleteMany({ where: { name: { contains: MARK.toUpperCase() } } });
  await prisma.productBrand.deleteMany({ where: { name: { contains: MARK } } });
  await prisma.$disconnect();
});

describe("cadastro de produto", () => {
  it("grava o nome em CAIXA ALTA, venha como vier", async () => {
    const created = await call(adminCtx).stock.create({
      name: `película 3d cerâmica ${MARK}`,
      salePrice: 30,
      costPrice: 10,
    });

    const stored = await prisma.product.findUniqueOrThrow({ where: { id: created.id } });
    expect(stored.name).toBe(`PELÍCULA 3D CERÂMICA ${MARK.toUpperCase()}`);
  });

  it("preenche search_name sem acento (trigger do banco)", async () => {
    const created = await call(adminCtx).stock.create({
      name: `capa anti-impacto ${MARK}`,
      newBrandName: `Genérica ${MARK}`,
      salePrice: 20,
      costPrice: 8,
    });

    const stored = await prisma.product.findUniqueOrThrow({ where: { id: created.id } });
    expect(stored.searchName).toBe(
      `capa anti-impacto ${MARK} generica ${MARK}`.toLowerCase(),
    );
  });
});

describe("busca de produto", () => {
  it("acha o produto acentuado digitando SEM acento — e vice-versa", async () => {
    await call(adminCtx).stock.create({
      name: `câmera traseira ${MARK}`,
      salePrice: 90,
      costPrice: 40,
    });

    const semAcento = await call(operatorCtx).sale.searchProducts({ query: `camera traseira ${MARK}` });
    expect(semAcento.map((p) => p.name)).toContain(`CÂMERA TRASEIRA ${MARK.toUpperCase()}`);

    const comAcento = await call(operatorCtx).sale.searchProducts({ query: `câmera traseira ${MARK}` });
    expect(comAcento.map((p) => p.name)).toContain(`CÂMERA TRASEIRA ${MARK.toUpperCase()}`);
  });

  it("vale para a listagem de estoque e para a busca global (⌘K)", async () => {
    const lista = await call(operatorCtx).stock.list({ search: `pelicula 3d ceramica ${MARK}` });
    expect(lista.data.map((p) => p.name)).toContain(`PELÍCULA 3D CERÂMICA ${MARK.toUpperCase()}`);

    const global = await call(operatorCtx).search.global({
      term: `pelicula 3d ceramica ${MARK}`,
      types: ["products"],
    });
    expect(global.products.map((p) => p.name)).toContain(`PELÍCULA 3D CERÂMICA ${MARK.toUpperCase()}`);
  });

  it("acha pela MARCA sem acento", async () => {
    const lista = await call(operatorCtx).stock.list({ search: `generica ${MARK}` });
    expect(lista.data.map((p) => p.name)).toContain(`CAPA ANTI-IMPACTO ${MARK.toUpperCase()}`);
  });
});

describe("gestão de marcas", () => {
  it("cria, lista com contagem de produtos, renomeia e exclui", async () => {
    const created = await call(adminCtx).stock.createBrand({ name: `Motorola ${MARK}` });

    const listed = await call(operatorCtx).stock.listBrands({ search: `motorola ${MARK}` });
    expect(listed.data).toEqual([{ id: created.id, name: `Motorola ${MARK}`, productCount: 0 }]);

    const renamed = await call(adminCtx).stock.updateBrand({ id: created.id, name: `Moto ${MARK}` });
    expect(renamed.name).toBe(`Moto ${MARK}`);

    await call(adminCtx).stock.deleteBrand({ id: created.id });
    const afterDelete = await call(operatorCtx).stock.listBrands({ search: `moto ${MARK}` });
    expect(afterDelete.data).toEqual([]);
  });

  it("recusa marca duplicada ignorando caixa e acento", async () => {
    const created = await call(adminCtx).stock.createBrand({ name: `Ásus ${MARK}` });

    await expect(call(adminCtx).stock.createBrand({ name: `ASUS ${MARK}` })).rejects.toThrow(/ja existe/i);
    await expect(call(adminCtx).stock.createBrand({ name: `  asus ${MARK} ` })).rejects.toThrow(/ja existe/i);

    await call(adminCtx).stock.deleteBrand({ id: created.id });
  });

  it("renomear a marca acompanha a busca dos produtos dela", async () => {
    const brand = await call(adminCtx).stock.createBrand({ name: `Peining ${MARK}` });
    await call(adminCtx).stock.create({
      name: `cabo usb ${MARK}`,
      brandId: brand.id,
      salePrice: 15,
      costPrice: 5,
    });

    await call(adminCtx).stock.updateBrand({ id: brand.id, name: `Pêining ${MARK}` });

    const lista = await call(operatorCtx).stock.list({ search: `peining ${MARK}` });
    expect(lista.data.map((p) => p.name)).toContain(`CABO USB ${MARK.toUpperCase()}`);
  });

  it("não exclui marca com produto vinculado, e operador não gerencia marca", async () => {
    const withProducts = await call(operatorCtx).stock.listBrands({ search: `peining ${MARK}` });
    const brandId = withProducts.data[0]!.id;
    expect(withProducts.data[0]!.productCount).toBe(1);

    await expect(call(adminCtx).stock.deleteBrand({ id: brandId })).rejects.toThrow(/vinculado/i);
    await expect(call(operatorCtx).stock.createBrand({ name: `Proibida ${MARK}` })).rejects.toThrow(
      /administradores/i,
    );
  });
});
