/**
 * P1-13: customer.create/update normaliza telefone para só dígitos, para a busca
 * por dígitos (digitsTerm) encontrar o registro. Antes gravava o valor cru (com
 * máscara), invisível à busca.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
vi.mock("@/server/auth", () => ({ auth: async () => null }));
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createCallerFactory } from "@/server/api/trpc";
import { appRouter } from "@/server/api/root";
import { withTenant } from "@/server/db";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const MARK = "customer-phone-normalize-test";
let ctx: any, tenantId: string, adminId: string;
const customerIds: string[] = [];

const call = () => createCallerFactory(appRouter)(ctx);

beforeAll(async () => {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "arena-tech" } });
  const admin = await prisma.user.findFirstOrThrow({ where: { name: "Admin Arena" } });
  tenantId = tenant.id;
  adminId = admin.id;
  ctx = {
    session: { user: { id: adminId, isSuperAdmin: false }, activeTenantId: tenantId, availableTenants: [{ id: tenantId, slug: "arena-tech", role: "admin" }] },
    tenantId,
    withTenant: (fn: any) => withTenant(tenantId, fn),
  };
});

afterAll(async () => {
  await prisma.customer.deleteMany({ where: { id: { in: customerIds } } });
  await prisma.$disconnect();
});

describe("customer telefone normalizado (P1-13)", () => {
  it("grava só dígitos e fica achável pela busca por dígitos", async () => {
    const created = await call().customer.create({
      type: "PF",
      name: `${MARK}-cliente`,
      cpf: "111.444.777-35", // CPF válido
      phone: "(11) 98888-7777",
      phoneSecondary: "(11) 3333-2222",
    });
    customerIds.push(created.id);

    const row = await prisma.customer.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.phone).toBe("11988887777");
    expect(row.phoneSecondary).toBe("1133332222");

    // Busca por dígitos (sem máscara) encontra o registro.
    const found = await call().customer.list({ search: "988887777", page: 0, pageSize: 10 });
    expect(found.data.some((c) => c.id === created.id)).toBe(true);
  });
});
