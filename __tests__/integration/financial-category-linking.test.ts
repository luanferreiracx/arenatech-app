/**
 * A3 — categoria financeira liga a FK `categoryId`, não só o texto-sombra.
 *
 * Bug: `financial.create`/`update` gravavam só a coluna texto `category`; a FK
 * `categoryId` (+ relation + índice) ficava SEMPRE null → nada era categorizável
 * em relatórios/DRE por categoria. O fix resolve o id por lookup de nome+tipo.
 *
 * Cobre: create linka pelo nome; escopo por tipo (mesmo nome, tipo errado → não
 * linka); nome sem categoria cadastrada → texto preservado, categoryId null.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { vi } from "vitest";
vi.mock("@/server/auth", () => ({ auth: async () => null }));
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createCallerFactory } from "@/server/api/trpc";
import { appRouter } from "@/server/api/root";
import { withTenant } from "@/server/db";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const MARK = "fin-cat-link-test";
let tenantId: string, adminId: string, adminCtx: any;
const txIds: string[] = [];
const catIds: string[] = [];

const call = (c: any) => createCallerFactory(appRouter)(c);

beforeAll(async () => {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "arena-tech" } });
  const admin = await prisma.user.findFirstOrThrow({ where: { name: "Admin Arena" } });
  tenantId = tenant.id;
  adminId = admin.id;
  adminCtx = {
    session: { user: { id: adminId, isSuperAdmin: false }, activeTenantId: tenantId, availableTenants: [{ id: tenantId, slug: "arena-tech", role: "admin" }] },
    tenantId,
    withTenant: (fn: any) => withTenant(tenantId, fn),
  };
});

afterAll(async () => {
  await prisma.installment.deleteMany({ where: { transactionId: { in: txIds } } });
  await prisma.financialTransaction.deleteMany({ where: { id: { in: txIds } } });
  await prisma.financialCategory.deleteMany({ where: { id: { in: catIds } } });
  await prisma.$disconnect();
});

describe("A3 — categoria financeira liga a FK", () => {
  it("create com categoria cadastrada popula categoryId (não só o texto)", async () => {
    const catName = `${MARK}-aluguel-${Math.random().toString(36).slice(2, 8)}`;
    const cat = await call(adminCtx).financial.createCategory({ name: catName, type: "DESPESA" });
    catIds.push(cat.id);

    const created = await call(adminCtx).financial.create({
      type: "PAYABLE",
      description: "Aluguel do mês",
      totalAmount: 150000,
      numInstallments: 1,
      emissionDate: new Date().toISOString(),
      // O select emite o NOME; o servidor resolve o id.
      category: catName,
    });
    txIds.push(created.id);

    const row = await prisma.financialTransaction.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.category).toBe(catName);
    expect(row.categoryId).toBe(cat.id);
  });

  it("escopo por tipo: nome de categoria DESPESA num RECEIVABLE não linka", async () => {
    const catName = `${MARK}-despesa-only-${Math.random().toString(36).slice(2, 8)}`;
    const cat = await call(adminCtx).financial.createCategory({ name: catName, type: "DESPESA" });
    catIds.push(cat.id);

    const created = await call(adminCtx).financial.create({
      type: "RECEIVABLE",
      description: "Receita com nome de despesa",
      totalAmount: 5000,
      numInstallments: 1,
      emissionDate: new Date().toISOString(),
      category: catName,
    });
    txIds.push(created.id);

    const row = await prisma.financialTransaction.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.category).toBe(catName); // texto preservado
    expect(row.categoryId).toBeNull(); // mas não linka a categoria de outro tipo
  });

  it("nome sem categoria cadastrada: texto preservado, categoryId null", async () => {
    const created = await call(adminCtx).financial.create({
      type: "PAYABLE",
      description: "Categoria texto-livre legado",
      totalAmount: 3000,
      numInstallments: 1,
      emissionDate: new Date().toISOString(),
      category: `${MARK}-inexistente`,
    });
    txIds.push(created.id);

    const row = await prisma.financialTransaction.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.category).toBe(`${MARK}-inexistente`);
    expect(row.categoryId).toBeNull();
  });
});
