/**
 * Finalização — Módulo 2 (PDV), PDV-1.
 *
 * O teto de desconto do operador (`maxDiscountPercentNonAdmin`, 10% na Arena
 * Tech) é aplicado em DOIS lugares — no desconto do carrinho e no override de
 * preço do item — e cada um mede o próprio pedaço isoladamente.
 *
 * `applyDiscount` mede o percentual contra o subtotal dos itens, que já vem
 * REDUZIDO pelos overrides. Então o operador baixa cada item até o teto, aplica
 * o desconto do carrinho até o teto de novo, e sai com quase o dobro do
 * autorizado (10% + 10% sobre o que sobrou = 19%).
 *
 * Este teste FALHA antes da correção.
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

const LIST_PRICE_CENTS = 100_000; // R$ 1.000,00
const CAP_PERCENT = 10;

let tenantId: string;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let operatorCtx: any;
let productId: string;
let previousCap: number | null = null;
/** A linha de settings já existia? Se não, este teste a criou e deve removê-la. */
let settingsExisted = false;
const saleIds: string[] = [];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const call = (c: any) => createCallerFactory(appRouter)(c);

beforeAll(async () => {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "arena-tech" } });
  const operator = await prisma.user.findFirstOrThrow({ where: { name: "Operador Arena" } });
  tenantId = tenant.id;
  operatorCtx = {
    session: {
      user: { id: operator.id, isSuperAdmin: false },
      activeTenantId: tenantId,
      availableTenants: [{ id: tenantId, slug: "arena-tech", role: "operator" }],
    },
    tenantId,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    withTenant: (fn: any) => withTenant(tenantId, fn),
  };

  const settings = await prisma.tenantReceivingSettings.findUnique({ where: { tenantId } });
  settingsExisted = !!settings;
  previousCap = settings?.maxDiscountPercentNonAdmin ?? null;
  await prisma.tenantReceivingSettings.upsert({
    where: { tenantId },
    update: { maxDiscountPercentNonAdmin: CAP_PERCENT },
    create: { tenantId, maxDiscountPercentNonAdmin: CAP_PERCENT },
  });

  const product = await prisma.product.create({
    data: {
      tenantId,
      name: "Produto teto de desconto",
      salePrice: new Prisma.Decimal(LIST_PRICE_CENTS / 100),
      costPrice: new Prisma.Decimal(500),
      currentStock: 50,
      isDevice: false,
    },
    select: { id: true },
  });
  productId = product.id;
});

afterAll(async () => {
  await prisma.saleItem.deleteMany({ where: { saleId: { in: saleIds } } });
  await prisma.sale.deleteMany({ where: { id: { in: saleIds } } });
  await prisma.product.deleteMany({ where: { id: productId } });
  // Criar a linha de settings do zero traz os DEFAULTS junto (minInstallmentValue
  // = R$ 50), e isso reprova outros arquivos da suíte que finalizam venda
  // parcelada. Se não existia antes, some daqui.
  if (settingsExisted) {
    await prisma.tenantReceivingSettings.updateMany({
      where: { tenantId },
      data: { maxDiscountPercentNonAdmin: previousCap },
    });
  } else {
    await prisma.tenantReceivingSettings.deleteMany({ where: { tenantId } });
  }
  await prisma.$disconnect();
});

async function newDraftWithItem(): Promise<{ saleId: string; itemId: string }> {
  // `createDraft` REUSA o rascunho aberto do vendedor (evita violar o unique e
  // aguenta o double-invoke do StrictMode). Sem abandonar antes, os testes
  // empilhavam itens no mesmo carrinho.
  await call(operatorCtx).sale.abandonDraft();
  const draft = await call(operatorCtx).sale.createDraft();
  saleIds.push(draft.id);
  await call(operatorCtx).sale.addItem({
    saleId: draft.id,
    productId,
    quantity: 1,
    unitPrice: LIST_PRICE_CENTS,
  });
  const item = await prisma.saleItem.findFirstOrThrow({ where: { saleId: draft.id } });
  return { saleId: draft.id, itemId: item.id };
}

describe("PDV-1 — o teto de desconto do operador não pode ser somado duas vezes", () => {
  it("recusa desconto de carrinho que, somado ao override do item, passa do teto", async () => {
    const { saleId, itemId } = await newDraftWithItem();

    // 1º pedaço: baixa o item exatamente até o teto (10% de R$ 1.000 → R$ 900).
    await call(operatorCtx).sale.updateItemPrice({
      saleId,
      itemId,
      unitPrice: 90_000,
    });

    // 2º pedaço: mais 10% no carrinho. Medido contra o subtotal JÁ reduzido, o
    // servidor lê "10%" e libera — o desconto real sobre a tabela vira 19%.
    await expect(
      call(operatorCtx).sale.applyDiscount({
        saleId,
        discountType: "percentage",
        discountValue: 10,
      }),
    ).rejects.toThrow(/[Dd]esconto acima do limite/);
  });

  it("recusa override de item quando o carrinho já usou o teto", async () => {
    const { saleId, itemId } = await newDraftWithItem();

    // Caminho inverso: primeiro o desconto do carrinho, depois o override.
    await call(operatorCtx).sale.applyDiscount({
      saleId,
      discountType: "percentage",
      discountValue: 10,
    });

    await expect(
      call(operatorCtx).sale.updateItemPrice({ saleId, itemId, unitPrice: 90_000 }),
    ).rejects.toThrow(/[Dd]esconto acima do limite/);
  });

  it("continua permitindo desconto dentro do teto", async () => {
    const { saleId, itemId } = await newDraftWithItem();

    // 4% no item + 5% no carrinho = 8,8% sobre a tabela, abaixo dos 10%.
    await call(operatorCtx).sale.updateItemPrice({ saleId, itemId, unitPrice: 96_000 });
    const sale = await call(operatorCtx).sale.applyDiscount({
      saleId,
      discountType: "percentage",
      discountValue: 5,
    });

    expect(sale).toBeTruthy();
  });
});
