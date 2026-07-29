/**
 * Finalização — Módulo 1 (Caixa), CX-1 no lado do PDV.
 *
 * `isCashMethod` não resolvia o id da forma cadastrada. Como o PDV manda
 * `PaymentMethod.code ?? PaymentMethod.id` e a forma "Dinheiro" nasce sem
 * `code`, a venda em dinheiro dessas lojas **não exigia caixa aberto** — o
 * dinheiro entrava na gaveta e o sistema não registrava movimento nenhum.
 *
 * Este teste FALHA antes da correção (a venda é aceita sem caixa aberto).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
vi.mock("@/server/auth", () => ({ auth: async () => null }));
import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createCallerFactory } from "@/server/api/trpc";
import { appRouter } from "@/server/api/root";
import { withTenant } from "@/server/db";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

let tenantId: string;
let adminId: string;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let adminCtx: any;
let cashMethodId: string;
let saleId: string;
let productId: string;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const call = (c: any) => createCallerFactory(appRouter)(c);

beforeAll(async () => {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "arena-tech" } });
  const admin = await prisma.user.findFirstOrThrow({ where: { name: "Admin Arena" } });
  tenantId = tenant.id;
  adminId = admin.id;
  adminCtx = {
    session: {
      user: { id: adminId, isSuperAdmin: false },
      activeTenantId: tenantId,
      availableTenants: [{ id: tenantId, slug: "arena-tech", role: "admin" }],
    },
    tenantId,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    withTenant: (fn: any) => withTenant(tenantId, fn),
  };

  const created = await prisma.paymentMethod.create({
    data: { tenantId, name: "Dinheiro (teste venda)", type: "CASH", code: null, active: true },
    select: { id: true },
  });
  cashMethodId = created.id;

  // Nenhum caixa aberto: é essa a condição sob teste.
  await prisma.cashSession.updateMany({
    where: { tenantId, userId: adminId, closedAt: null },
    data: { closedAt: new Date(), closeType: "MANUAL", calculatedBalance: new Prisma.Decimal(0) },
  });

  const product = await prisma.product.create({
    data: {
      tenantId,
      name: "Produto teste CX-1",
      salePrice: new Prisma.Decimal(50),
      costPrice: new Prisma.Decimal(20),
      currentStock: 10,
      isDevice: false,
    },
    select: { id: true },
  });
  productId = product.id;

  const draft = await call(adminCtx).sale.createDraft();
  saleId = draft.id;
  await call(adminCtx).sale.addItem({ saleId, productId, quantity: 1, unitPrice: 5_000 });
});

afterAll(async () => {
  await prisma.saleItem.deleteMany({ where: { saleId } });
  await prisma.sale.deleteMany({ where: { id: saleId } });
  await prisma.product.deleteMany({ where: { id: productId } });
  await prisma.paymentMethod.deleteMany({ where: { id: cashMethodId } });
  await prisma.$disconnect();
});

describe("CX-1 — venda em dinheiro pelo id da forma exige caixa aberto", () => {
  it("recusa a finalização sem caixa aberto quando o método vem como UUID", async () => {
    await expect(
      call(adminCtx).sale.finalize({
        saleId,
        payments: [{ method: cashMethodId, amount: 5_000 }],
      }),
    ).rejects.toThrow(/[Cc]aixa nao esta aberto/);
  });
});
