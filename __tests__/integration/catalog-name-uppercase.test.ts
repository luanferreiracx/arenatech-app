/**
 * Caixa alta em serviço, aparelho comprado e venda rápida (decisão do dono,
 * 2026-08-01) — o mesmo padrão já aplicado ao produto e ao item de venda.
 *
 * O nome do serviço é DERIVADO ("<tipo> - <modelo>"), então o teste prova que os
 * dois pedaços sobem juntos: senão a lista de serviços mostraria
 * "TROCA DE TELA - iPhone 13", que é a metade-metade que o dono reclamou no
 * relatório de vendas.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
vi.mock("@/server/auth", () => ({ auth: async () => null }));
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createCallerFactory } from "@/server/api/trpc";
import { appRouter } from "@/server/api/root";
import { withTenant } from "@/server/db";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

const MARK = `caixa-${Date.now().toString(36)}`;
/* eslint-disable @typescript-eslint/no-explicit-any */
let tenantId: string;
let adminCtx: any;
let adminId: string;
const serviceIds: string[] = [];
const quickSaleIds: string[] = [];

const call = (ctx: any) => createCallerFactory(appRouter)(ctx);

beforeAll(async () => {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "arena-tech" } });
  const admin = await prisma.user.findFirstOrThrow({ where: { name: "Admin Arena" } });
  tenantId = tenant.id;
  adminId = admin.id;
  adminCtx = {
    session: {
      user: { id: admin.id, isSuperAdmin: false },
      activeTenantId: tenantId,
      availableTenants: [{ id: tenantId, slug: "arena-tech", role: "admin" }],
    },
    tenantId,
    withTenant: (fn: any) => withTenant(tenantId, fn),
  };
});

afterAll(async () => {
  await prisma.service.deleteMany({ where: { id: { in: serviceIds } } });
  await prisma.serviceType.deleteMany({ where: { slug: { contains: MARK } } });
  await prisma.quickSale.deleteMany({ where: { id: { in: quickSaleIds } } });
  await prisma.$disconnect();
});

describe("serviço", () => {
  it("tipo, modelo e nome composto saem em caixa alta", async () => {
    const created = await call(adminCtx).catalog.createService({
      newServiceTypeName: `Troca de tela ${MARK}`,
      deviceModel: `iPhone 13 pro max ${MARK}`,
      basePrice: 45000,
    });
    serviceIds.push(created.id);

    expect(created.serviceType).toBe(`TROCA DE TELA ${MARK.toUpperCase()}`);
    expect(created.deviceModel).toBe(`IPHONE 13 PRO MAX ${MARK.toUpperCase()}`);
    expect(created.name).toBe(
      `TROCA DE TELA ${MARK.toUpperCase()} - IPHONE 13 PRO MAX ${MARK.toUpperCase()}`,
    );
    // A regressão que estamos travando: metade do rótulo em caixa mista.
    expect(created.name).not.toContain("iPhone");
  });

  it("o tipo continua deduplicando por caixa/acento (o slug não subiu junto)", async () => {
    const outro = await call(adminCtx).catalog.createService({
      newServiceTypeName: `TROCA DE TELA ${MARK}`,
      deviceModel: `Galaxy S24 ${MARK}`,
      basePrice: 30000,
    });
    serviceIds.push(outro.id);

    const tipos = await prisma.serviceType.findMany({
      where: { tenantId, slug: { contains: MARK.toLowerCase() } },
      select: { id: true, name: true },
    });
    expect(tipos).toHaveLength(1);
    expect(tipos[0]!.name).toBe(`TROCA DE TELA ${MARK.toUpperCase()}`);
  });
});

describe("venda rápida", () => {
  it("descrição do produto sai em caixa alta ao editar", async () => {
    // A criação passa pela Eulen (gera o PIX na hora), então o teste semeia a
    // linha direto e exercita a edição — é o mesmo normalizador nos dois lados.
    const seeded = await prisma.quickSale.create({
      data: {
        tenantId,
        number: `QS-${MARK}`,
        productDescription: "case silicone antigo",
        quantity: 1,
        unitPrice: 50,
        totalAmount: 50,
        status: "AWAITING_PAYMENT",
        createdById: adminId,
        depixStatus: "pending",
      },
    });
    quickSaleIds.push(seeded.id);

    await call(adminCtx).quickSale.update({
      id: seeded.id,
      productDescription: `Case silicone ${MARK}`,
    });

    const stored = await prisma.quickSale.findUniqueOrThrow({ where: { id: seeded.id } });
    expect(stored.productDescription).toBe(`CASE SILICONE ${MARK.toUpperCase()}`);
  });
});
