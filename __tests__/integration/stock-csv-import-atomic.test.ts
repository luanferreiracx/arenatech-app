/**
 * Auditoria Produtos/Estoque — S3/A6 (ao vivo): import CSV é ATÔMICO.
 * Happy path: import válido persiste todos os produtos.
 * Rollback: um erro de INSERT no meio do lote reverte TUDO e o caller recebe
 *   erro — em vez do "sucesso falso" (N criados com o banco vazio) do try/catch
 *   por linha dentro de uma transação abortada.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
vi.mock("@/server/auth", () => ({ auth: async () => null }));
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createCallerFactory } from "@/server/api/trpc";
import { appRouter } from "@/server/api/root";
import { withTenant } from "@/server/db";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const MARK = "csv-atomic-test";
let ctx: any, tenantId: string, adminId: string;

const call = () => createCallerFactory(appRouter)(ctx);

beforeAll(async () => {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "arena-tech" } });
  const admin = await prisma.user.findFirstOrThrow({ where: { name: "Admin Arena" } });
  tenantId = tenant.id; adminId = admin.id;
  ctx = {
    session: { user: { id: adminId, isSuperAdmin: false }, activeTenantId: tenantId, availableTenants: [{ id: tenantId, slug: "arena-tech", role: "admin" }] },
    tenantId, withTenant: (fn: any) => withTenant(tenantId, fn),
  };
});

afterAll(async () => {
  await prisma.stockMovement.deleteMany({ where: { reason: "Importacao CSV em lote", product: { name: { startsWith: MARK } } } });
  const prods = await prisma.product.findMany({ where: { name: { startsWith: MARK } }, select: { id: true } });
  for (const p of prods) await prisma.stockMovement.deleteMany({ where: { productId: p.id } });
  await prisma.product.deleteMany({ where: { name: { startsWith: MARK } } });
  await prisma.productCategory.deleteMany({ where: { name: { startsWith: MARK } } });
  await prisma.$disconnect();
});

describe("Auditoria Estoque — import CSV atômico (ao vivo)", () => {
  it("happy path: import válido persiste todos os produtos", async () => {
    const res = await call().stock.importCsv({
      lines: [
        { name: `${MARK}-A`, salePrice: 10000, quantity: 5 },
        { name: `${MARK}-B`, salePrice: 20000 },
      ],
    });
    expect(res.productsCreated).toBe(2);
    expect(res.success).toBe(true);
    const count = await prisma.product.count({ where: { name: { startsWith: `${MARK}-` }, active: true } });
    expect(count).toBe(2);
  });

  it("rollback: erro de INSERT no meio reverte TUDO (sem sucesso falso)", async () => {
    // Categoria soft-deletada com nome X: o import (find-first deletedAt:null)
    // não a acha, tenta criar X → colide com o @@unique([tenantId,name]) que
    // inclui a linha soft-deletada → INSERT falha no meio do lote.
    const clashName = `${MARK}-cat-clash`;
    await prisma.productCategory.create({ data: { tenantId, name: clashName, deletedAt: new Date() } });

    const before = await prisma.product.count({ where: { name: { startsWith: `${MARK}-roll` } } });

    await expect(
      call().stock.importCsv({
        lines: [
          { name: `${MARK}-roll-ok`, salePrice: 10000 }, // válido, inserido ANTES da falha
          { name: `${MARK}-roll-bad`, salePrice: 20000, category: clashName }, // falha ao criar categoria
        ],
      }),
    ).rejects.toThrow();

    // NADA foi persistido (nem o produto válido antes da falha) — rollback total.
    const after = await prisma.product.count({ where: { name: { startsWith: `${MARK}-roll` } } });
    expect(after).toBe(before);
  });
});
