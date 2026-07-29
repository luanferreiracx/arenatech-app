/**
 * Finalização — Módulo 3 (Estoque), EST-1.
 *
 * O saldo de um produto tem TRÊS regimes (`resolveCurrentStockByProduct`):
 * serializado = `COUNT(StockItem disponível)`, com variações = soma das
 * variações, simples = `product.currentStock`. O procedure `stock.reportPosicao`
 * usa o resolver. A rota REST que gera o **PDF** desses mesmos relatórios — a
 * que a tela de relatórios abre — lê `product.currentStock` cru.
 *
 * Medido em produção (2026-07-29): o PDF de Posição de Estoque some com 34
 * aparelhos serializados (R$ 3.000) e 596 unidades de produtos com variação.
 * Pior, o de Estoque Mínimo FILTRA por esse número: produto cheio aparece como
 * "abaixo do mínimo" e manda comprar o que já tem.
 *
 * Este teste FALHA antes da correção.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

const sessionMock = vi.hoisted(() => ({
  current: null as unknown,
}));
vi.mock("@/server/auth", () => ({ auth: async () => sessionMock.current }));

import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/reports/stock/[type]/route";
import { withTenant } from "@/server/db";
import { resolveCurrentStockByProduct } from "@/server/services/stock-item.service";
import {
  loadLowStockRows,
  loadStockPositionRows,
} from "@/server/services/stock-position.service";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const SERIALIZED_UNITS = 3;

let tenantId: string;
let productId: string;
const stockItemIds: string[] = [];

beforeAll(async () => {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "arena-tech" } });
  const admin = await prisma.user.findFirstOrThrow({ where: { name: "Admin Arena" } });
  tenantId = tenant.id;

  sessionMock.current = {
    user: { id: admin.id, name: admin.name, isSuperAdmin: false },
    activeTenantId: tenantId,
    availableTenants: [{ id: tenantId, slug: "arena-tech", name: "Arena Tech", role: "admin" }],
  };

  // Produto serializado com aparelhos disponíveis e `currentStock` em zero — o
  // estado real de 22 produtos em produção.
  const product = await prisma.product.create({
    data: {
      tenantId,
      name: "Aparelho serializado EST-1",
      sku: "EST1-SERIAL",
      isSerialized: true,
      isDevice: true,
      currentStock: 0,
      minStock: 1,
      costPrice: new Prisma.Decimal(1000),
      salePrice: new Prisma.Decimal(1500),
      active: true,
    },
    select: { id: true },
  });
  productId = product.id;

  for (let i = 0; i < SERIALIZED_UNITS; i++) {
    const item = await prisma.stockItem.create({
      data: {
        tenantId,
        productId,
        imei: `35000000000${String(i).padStart(4, "0")}`,
        status: "AVAILABLE",
        costPrice: new Prisma.Decimal(1000),
      },
      select: { id: true },
    });
    stockItemIds.push(item.id);
  }
});

afterAll(async () => {
  await prisma.stockItem.deleteMany({ where: { id: { in: stockItemIds } } });
  await prisma.product.deleteMany({ where: { id: productId } });
  await prisma.$disconnect();
});

function reportRequest(type: string): [NextRequest, { params: Promise<{ type: string }> }] {
  const req = new NextRequest(`http://localhost/api/reports/stock/${type}`);
  req.cookies.set("x-active-tenant", tenantId);
  return [req, { params: Promise.resolve({ type }) }];
}

describe("EST-1 — o PDF de estoque usa o saldo real, não o campo cru", () => {
  it("o resolver e o campo cru discordam neste produto (premissa do teste)", async () => {
    const real = await withTenant(tenantId, async (tx) =>
      resolveCurrentStockByProduct(tx, [
        { id: productId, currentStock: 0, isSerialized: true, hasVariations: false },
      ]),
    );
    expect(real.get(productId)).toBe(SERIALIZED_UNITS);
  });

  it("Posição de Estoque não reporta zero para produto com aparelhos disponíveis", async () => {
    const rows = await withTenant(tenantId, (tx) => loadStockPositionRows(tx));
    const row = rows.find((r) => r.sku === "EST1-SERIAL");
    expect(row?.currentStock).toBe(SERIALIZED_UNITS);
  });

  it("Estoque Mínimo não acusa falta em produto que está cheio", async () => {
    const rows = await withTenant(tenantId, (tx) => loadLowStockRows(tx));
    expect(rows.find((r) => r.sku === "EST1-SERIAL")).toBeUndefined();
  });

  it("a rota do PDF responde com o documento", async () => {
    const [req, ctx] = reportRequest("posicao-estoque");
    const res = await GET(req, ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("pdf");
  });
});
