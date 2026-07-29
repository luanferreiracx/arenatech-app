/**
 * Finalização — Módulo 2 (PDV), PDV-4.
 *
 * A página pública `/receipt/[token]` buscava a venda SÓ pelo token. O
 * procedure irmão `sale.byPublicLink` — que nenhuma tela chama — restringe a
 * status públicos porque, nas palavras do próprio código, "vazaria
 * rascunho/cancelada via link enumeravel". A regra nunca chegou à página que as
 * pessoas usam: produção tinha 6 rascunhos servidos como "Recibo de Compra".
 *
 * Este teste exercita a MESMA consulta da página (o Server Component busca via
 * Prisma direto, sem passar pelo tRPC).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
vi.mock("@/server/auth", () => ({ auth: async () => null }));
import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { withAdmin } from "@/server/db";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const PUBLIC_SALE_STATUSES = ["COMPLETED", "REFUNDED", "PARTIALLY_REFUNDED"] as const;

let tenantId: string;
let sellerId: string;
const saleIds: string[] = [];

beforeAll(async () => {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "arena-tech" } });
  const seller = await prisma.user.findFirstOrThrow({ where: { name: "Admin Arena" } });
  tenantId = tenant.id;
  sellerId = seller.id;
});

afterAll(async () => {
  await prisma.sale.deleteMany({ where: { id: { in: saleIds } } });
  await prisma.$disconnect();
});

async function createSale(status: string, token: string, deleted = false): Promise<string> {
  const sale = await prisma.sale.create({
    data: {
      tenantId,
      sellerId,
      number: `PDV4-${token}`,
      status: status as Prisma.SaleCreateInput["status"],
      publicLink: token,
      totalAmount: new Prisma.Decimal(100),
      deletedAt: deleted ? new Date() : null,
    },
    select: { id: true },
  });
  saleIds.push(sale.id);
  return sale.id;
}

/** Espelha a consulta da página pública. */
function findPublicSale(token: string) {
  return withAdmin(async (tx) =>
    tx.sale.findFirst({
      where: {
        publicLink: token,
        status: { in: [...PUBLIC_SALE_STATUSES] },
        deletedAt: null,
      },
    }),
  );
}

describe("PDV-4 — o recibo público só serve venda concluída", () => {
  it("não serve rascunho", async () => {
    await createSale("DRAFT", "pdv4-rascunho-token");
    expect(await findPublicSale("pdv4-rascunho-token")).toBeNull();
  });

  it("não serve venda cancelada", async () => {
    await createSale("CANCELLED", "pdv4-cancelada-token");
    expect(await findPublicSale("pdv4-cancelada-token")).toBeNull();
  });

  it("não serve venda apagada (soft delete)", async () => {
    await createSale("COMPLETED", "pdv4-apagada-token", true);
    expect(await findPublicSale("pdv4-apagada-token")).toBeNull();
  });

  it("continua servindo venda concluída e estornada", async () => {
    await createSale("COMPLETED", "pdv4-concluida-token");
    await createSale("REFUNDED", "pdv4-estornada-token");
    expect(await findPublicSale("pdv4-concluida-token")).not.toBeNull();
    expect(await findPublicSale("pdv4-estornada-token")).not.toBeNull();
  });
});
