/**
 * Auditoria 2026-07-25 — comissão paga DUAS VEZES na mesma OS.
 *
 * Um prestador SELLER que é o VENDEDOR (`vendorId`) de uma OS executada por
 * OUTRO técnico gerava dois eventos sobre a MESMA OS:
 *
 *   1. `intermediacao_at` / OWN  — porque `vendorId === provider.userId`
 *   2. `servico_at_loja` / STORE — porque o filtro de participação olhava só
 *                                   `technicianId: { not: userId }`
 *
 * Baldes diferentes ⇒ as duas comissões somam. As VENDAS já tinham o guard
 * equivalente (`sellerId: { not: provider.userId }`, com o comentário "evita
 * comissionar a mesma venda 2× na mesma regra"); a participação em OS ficou de
 * fora.
 *
 * DECISÃO DO DONO (2026-07-25): quem vendeu a OS ganha pela INTERMEDIAÇÃO e não
 * entra também como participação na loja.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
vi.mock("@/server/auth", () => ({ auth: async () => null }));
import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { withTenant } from "@/server/db";
import { collectProviderEvents } from "@/server/services/commission-preview.service";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const MARK = "comm-double-pay";
let tenantId: string, sellerUserId: string, techUserId: string;
let providerId: string, contractId: string, customerId: string;
const orderIds: string[] = [];
const YEAR = new Date().getFullYear();

beforeAll(async () => {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "arena-tech" } });
  const seller = await prisma.user.findFirstOrThrow({ where: { name: "Admin Arena" } });
  const tech = await prisma.user.findFirstOrThrow({ where: { name: "Tecnico Arena" } });
  tenantId = tenant.id;
  sellerUserId = seller.id;
  techUserId = tech.id;

  customerId = (await prisma.customer.create({
    data: { tenantId, name: `${MARK}-cliente`, phone: "11955554444" },
  })).id;

  await prisma.provider.deleteMany({ where: { tenantId, userId: sellerUserId } });
  providerId = (await prisma.provider.create({
    data: { tenantId, userId: sellerUserId, profile: "SELLER" as never },
  })).id;
  contractId = (await prisma.providerContract.create({
    data: { tenantId, providerId, startDate: new Date(YEAR, 0, 1) },
  })).id;

  // Contrato com AS DUAS regras — o cenário do bug.
  await prisma.providerCommissionRule.create({
    data: {
      tenantId, contractId, category: "intermediacao_at", scope: "normal",
      valueType: "PERCENT", base: "PROFIT", source: "OWN",
      rangeMin: new Prisma.Decimal(0), rangeMax: null, rate: new Prisma.Decimal(10),
    },
  });
  await prisma.providerCommissionRule.create({
    data: {
      tenantId, contractId, category: "servico_at_loja", scope: "normal",
      valueType: "PERCENT", base: "PROFIT", source: "STORE",
      rangeMin: new Prisma.Decimal(0), rangeMax: null, rate: new Prisma.Decimal(5),
    },
  });

  // OS vendida pelo SELLER e executada por OUTRO técnico, paga no período.
  const os = await prisma.serviceOrder.create({
    data: {
      tenantId,
      number: `${MARK}-${Date.now()}`,
      customerId,
      createdById: sellerUserId,
      vendorId: sellerUserId,      // ← ele intermediou
      technicianId: techUserId,    // ← outro executou
      status: "PAID",
      publicLink: `${MARK}-pl-${Date.now()}`,
      serviceAmount: 1000,
      totalAmount: 1000,
      partsCost: 0,
      otherCost: 0,
      paymentDate: new Date(YEAR, new Date().getMonth(), 15),
    },
  });
  orderIds.push(os.id);
});

afterAll(async () => {
  await prisma.providerCommissionRule.deleteMany({ where: { contractId } });
  await prisma.providerContract.deleteMany({ where: { id: contractId } });
  await prisma.provider.deleteMany({ where: { id: providerId } });
  await prisma.serviceOrder.deleteMany({ where: { id: { in: orderIds } } });
  await prisma.customer.deleteMany({ where: { id: customerId } });
  await prisma.$disconnect();
});

describe("comissão de OS — quem intermediou não recebe também como participação", () => {
  it("gera UM evento para a OS intermediada, não dois", async () => {
    const periodStart = new Date(YEAR, new Date().getMonth(), 1);
    const periodEnd = new Date(YEAR, new Date().getMonth() + 1, 0, 23, 59, 59);

    const events = await withTenant(tenantId, (tx) =>
      collectProviderEvents(
        tx as never,
        { id: providerId, userId: sellerUserId, profile: "SELLER" },
        periodStart,
        periodEnd,
        false, // sem regra de venda STORE
        true,  // COM regra de participação em AT
      ),
    );

    const daOs = events.filter((e) => e.referencia_id === orderIds[0]);
    expect(daOs).toHaveLength(1);
    // O que sobra é a INTERMEDIAÇÃO (decisão do dono), não a participação.
    expect(daOs[0]!.category).toBe("intermediacao_at");
    expect(daOs[0]!.source).toBe("OWN");
  });

  it("OS de outro vendedor continua gerando participação (não quebrou o caso legítimo)", async () => {
    const os = await prisma.serviceOrder.create({
      data: {
        tenantId,
        number: `${MARK}-outro-${Date.now()}`,
        customerId,
        createdById: techUserId,
        vendorId: techUserId,      // vendida por OUTRA pessoa
        technicianId: techUserId,  // executada por OUTRA pessoa
        status: "PAID",
        publicLink: `${MARK}-pl2-${Date.now()}`,
        serviceAmount: 500,
        totalAmount: 500,
        partsCost: 0,
        otherCost: 0,
        paymentDate: new Date(YEAR, new Date().getMonth(), 16),
      },
    });
    orderIds.push(os.id);

    const periodStart = new Date(YEAR, new Date().getMonth(), 1);
    const periodEnd = new Date(YEAR, new Date().getMonth() + 1, 0, 23, 59, 59);
    const events = await withTenant(tenantId, (tx) =>
      collectProviderEvents(
        tx as never,
        { id: providerId, userId: sellerUserId, profile: "SELLER" },
        periodStart,
        periodEnd,
        false,
        true,
      ),
    );

    const daOutra = events.filter((e) => e.referencia_id === os.id);
    expect(daOutra).toHaveLength(1);
    expect(daOutra[0]!.category).toBe("servico_at_loja");
    expect(daOutra[0]!.source).toBe("STORE");
  });
});
