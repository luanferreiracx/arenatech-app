/**
 * B4 — busca global do command palette (search.global): resolve cliente/produto
 * por termo, respeita o filtro de tipos e casa CPF/telefone por dígitos.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
vi.mock("@/server/auth", () => ({ auth: async () => null }));
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createCallerFactory } from "@/server/api/trpc";
import { appRouter } from "@/server/api/root";
import { withTenant } from "@/server/db";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const MARK = `search-${Date.now().toString(36)}`;
let tenantId: string, adminId: string, adminCtx: any;
const customerIds: string[] = [];
const productIds: string[] = [];

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

  const cust = await prisma.customer.create({
    data: { tenantId, name: `Cliente ${MARK}`, phone: "11987654321", cpf: "39053344705" },
  });
  customerIds.push(cust.id);
  const prod = await prisma.product.create({
    data: { tenantId, name: `Produto ${MARK}`, sku: `SKU-${MARK}` },
  });
  productIds.push(prod.id);
});

afterAll(async () => {
  await prisma.customer.deleteMany({ where: { id: { in: customerIds } } });
  await prisma.product.deleteMany({ where: { id: { in: productIds } } });
  await prisma.$disconnect();
});

describe("B4 — search.global", () => {
  it("acha cliente e produto pelo termo", async () => {
    const res = await call(adminCtx).search.global({ term: MARK });
    expect(res.customers.some((c: any) => c.id === customerIds[0])).toBe(true);
    expect(res.products.some((p: any) => p.id === productIds[0])).toBe(true);
  });

  it("respeita o filtro de tipos (só produtos)", async () => {
    const res = await call(adminCtx).search.global({ term: MARK, types: ["products"] });
    expect(res.products.some((p: any) => p.id === productIds[0])).toBe(true);
    expect(res.customers).toHaveLength(0);
    expect(res.serviceOrders).toHaveLength(0);
  });

  it("acha cliente por dígitos do CPF/telefone", async () => {
    const byCpf = await call(adminCtx).search.global({ term: "390533", types: ["customers"] });
    expect(byCpf.customers.some((c: any) => c.id === customerIds[0])).toBe(true);
    const byPhone = await call(adminCtx).search.global({ term: "1198765", types: ["customers"] });
    expect(byPhone.customers.some((c: any) => c.id === customerIds[0])).toBe(true);
  });

  it("subtitle do cliente prioriza CPF", async () => {
    const res = await call(adminCtx).search.global({ term: MARK, types: ["customers"] });
    const found = res.customers.find((c: any) => c.id === customerIds[0]);
    expect(found?.subtitle).toBe("39053344705");
  });
});
