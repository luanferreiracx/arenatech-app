/**
 * NF-e com produto SERIALIZADO (auditoria de frontend 2026-08-04).
 *
 * O import pulava o produto serializado (`if (!product.isSerialized)`) mas
 * seguia marcando o item como IMPORTED e somando no `importedCount`. O
 * operador lia "3 itens importados", conferia o estoque e não achava nada —
 * sem erro, sem aviso, sem pista de onde a mercadoria tinha ido.
 *
 * O pulo em si está CORRETO: aparelho com IMEI/série entra unidade a unidade
 * (cada uma vira um StockItem com seu identificador), não por quantidade. O
 * defeito é dizer que importou.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
vi.mock("@/server/auth", () => ({ auth: async () => null }));
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createCallerFactory } from "@/server/api/trpc";
import { appRouter } from "@/server/api/root";
import { withTenant } from "@/server/db";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const MARK = "nfe-serial";
let tenantId: string;
let userId: string;
let ctx: any;
const productIds: string[] = [];
const importIds: string[] = [];

const call = () => createCallerFactory(appRouter)(ctx);

beforeAll(async () => {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "arena-tech" } });
  const user = await prisma.user.findFirstOrThrow({ where: { name: "Admin Arena" } });
  tenantId = tenant.id;
  userId = user.id;
  ctx = {
    session: {
      user: { id: userId, isSuperAdmin: false },
      activeTenantId: tenantId,
      availableTenants: [{ id: tenantId, slug: "arena-tech", role: "admin" }],
    },
    tenantId,
    withTenant: (fn: any) => withTenant(tenantId, fn),
  };
});

afterAll(async () => {
  for (const id of importIds) {
    await prisma.nfeImportItem.deleteMany({ where: { nfeImportId: id } });
    await prisma.nfeImport.deleteMany({ where: { id } });
  }
  for (const p of productIds) {
    await prisma.stockMovement.deleteMany({ where: { productId: p } });
    await prisma.product.deleteMany({ where: { id: p } });
  }
  await prisma.$disconnect();
});

let seq = 0;
async function makeProduct(isSerialized: boolean): Promise<string> {
  seq += 1;
  const p = await prisma.product.create({
    data: {
      tenantId,
      name: `${MARK}-${isSerialized ? "serial" : "simples"}-${Date.now()}-${seq}`,
      salePrice: 100,
      costPrice: 50,
      currentStock: 0,
      isSerialized,
      hasVariations: false,
      active: true,
    },
  });
  productIds.push(p.id);
  return p.id;
}

/** NF-e com um item por produto, todos já vinculados (status LINKED). */
async function makeNfe(links: Array<{ productId: string; quantity: number }>) {
  seq += 1;
  const nf = await prisma.nfeImport.create({
    data: {
      tenantId,
      userId,
      accessKey: `${Date.now()}${seq}`.padEnd(44, "0").slice(0, 44),
      nfNumber: `${MARK}-${seq}`,
      status: "PENDING",
      items: {
        create: links.map((l, i) => ({
          tenantId,
          itemNumber: i + 1,
          productCode: `COD-${i}`,
          description: `item ${i}`,
          quantity: l.quantity,
          unitPrice: 50,
          totalValue: 50 * l.quantity,
          productId: l.productId,
          status: "LINKED" as const,
        })),
      },
    },
  });
  importIds.push(nf.id);
  return nf.id;
}

describe("NF-e com produto serializado", () => {
  it("não conta como importado o que não entrou no estoque", async () => {
    const serialId = await makeProduct(true);
    const nfeId = await makeNfe([{ productId: serialId, quantity: 3 }]);

    const res = await call().nfeImport.importToInventory({ nfeImportId: nfeId });

    // O estoque NÃO subiu — e isso está certo: aparelho com IMEI entra unidade
    // a unidade pelo fluxo de compra, não por quantidade da nota.
    const product = await prisma.product.findUniqueOrThrow({
      where: { id: serialId },
      select: { currentStock: true },
    });
    expect(product.currentStock).toBe(0);

    // O que estava errado: dizer que importou. Agora o item fica de fora da
    // contagem e é reportado como PULADO, para o operador saber que precisa
    // dar entrada nesses aparelhos pelo fluxo de compra.
    expect(res.imported).toBe(0);
    expect(res.skippedSerialized).toBe(1);
  });

  it("produto simples na mesma nota continua entrando normalmente", async () => {
    const simplesId = await makeProduct(false);
    const serialId = await makeProduct(true);
    const nfeId = await makeNfe([
      { productId: simplesId, quantity: 10 },
      { productId: serialId, quantity: 2 },
    ]);

    const res = await call().nfeImport.importToInventory({ nfeImportId: nfeId });

    // O serializado não pode contaminar o resto da nota.
    const simples = await prisma.product.findUniqueOrThrow({
      where: { id: simplesId },
      select: { currentStock: true },
    });
    expect(simples.currentStock).toBe(10);
    expect(res.imported).toBe(1);
    expect(res.skippedSerialized).toBe(1);
  });
});
