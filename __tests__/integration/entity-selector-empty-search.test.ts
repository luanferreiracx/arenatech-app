/**
 * Autocomplete (EntitySelector) com termo VAZIO — regressão do erro visto na
 * entrada de estoque em 2026-08-01.
 *
 * O componente dispara a primeira busca no instante em que o popover abre, antes
 * de o operador digitar qualquer coisa. As procedures exigiam `min(1)`, então
 * essa primeira chamada voltava 400 e o app mostrava "Nao foi possivel carregar"
 * com o dump cru do Zod. Termo vazio significa "me mostre as primeiras opções".
 *
 * As três procedures que alimentam o EntitySelector estão cobertas aqui:
 * entrada/baixa/ajuste (stock.searchProducts), fornecedor (stock.searchSuppliers)
 * e compra de aparelhos (sale.searchProducts).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
vi.mock("@/server/auth", () => ({ auth: async () => null }));
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createCallerFactory } from "@/server/api/trpc";
import { appRouter } from "@/server/api/root";
import { withTenant } from "@/server/db";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

const MARK = `seletor-vazio-${Date.now().toString(36)}`;
let tenantId: string;
/* eslint-disable @typescript-eslint/no-explicit-any */
let ctx: any;
const call = () => createCallerFactory(appRouter)(ctx);

beforeAll(async () => {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "arena-tech" } });
  const operator = await prisma.user.findFirstOrThrow({ where: { name: "Operador Arena" } });
  tenantId = tenant.id;
  ctx = {
    session: {
      user: { id: operator.id, isSuperAdmin: false },
      activeTenantId: tenantId,
      availableTenants: [{ id: tenantId, slug: "arena-tech", role: "operator" }],
    },
    tenantId,
    withTenant: (fn: any) => withTenant(tenantId, fn),
  };

  await prisma.product.create({
    data: { tenantId, name: `PRODUTO ${MARK.toUpperCase()}`, salePrice: 10, costPrice: 5, currentStock: 3 },
  });
  await prisma.supplier.create({ data: { tenantId, type: "PJ", name: `Fornecedor ${MARK}` } });
});

afterAll(async () => {
  await prisma.product.deleteMany({ where: { name: { contains: MARK.toUpperCase() } } });
  await prisma.supplier.deleteMany({ where: { name: { contains: MARK } } });
  await prisma.$disconnect();
});

describe("autocomplete com termo vazio", () => {
  it("stock.searchProducts devolve as primeiras opções em vez de estourar", async () => {
    const abertura = await call().stock.searchProducts({ search: "" });
    expect(abertura.length).toBeGreaterThan(0);
    expect(abertura.length).toBeLessThanOrEqual(15);
  });

  it("stock.searchProducts continua filtrando quando há termo", async () => {
    const filtrado = await call().stock.searchProducts({ search: MARK });
    expect(filtrado.map((p) => p.name)).toEqual([`PRODUTO ${MARK.toUpperCase()}`]);
  });

  it("stock.searchSuppliers devolve as primeiras opções em vez de estourar", async () => {
    const abertura = await call().stock.searchSuppliers({ search: "" });
    expect(abertura.length).toBeGreaterThan(0);
    expect(abertura.length).toBeLessThanOrEqual(15);

    const filtrado = await call().stock.searchSuppliers({ search: MARK });
    expect(filtrado.map((s) => s.name)).toEqual([`Fornecedor ${MARK}`]);
  });

  it("sale.searchProducts devolve as primeiras opções em vez de estourar", async () => {
    const abertura = await call().sale.searchProducts({ query: "" });
    expect(abertura.length).toBeGreaterThan(0);
    expect(abertura.length).toBeLessThanOrEqual(20);

    const filtrado = await call().sale.searchProducts({ query: MARK });
    expect(filtrado.map((p) => p.name)).toEqual([`PRODUTO ${MARK.toUpperCase()}`]);
  });

  it("espaço em branco é tratado como vazio, não como termo", async () => {
    const soEspaco = await call().stock.searchProducts({ search: "   " });
    expect(soEspaco.length).toBeGreaterThan(0);
  });
});
