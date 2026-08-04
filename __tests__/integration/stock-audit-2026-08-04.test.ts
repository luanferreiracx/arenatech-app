/**
 * Auditoria de estoque 2026-08-04 — testes de regressão dos achados P0/P1.
 *
 * Cada `it` abaixo nasceu VERMELHO contra o código de então e prova um achado
 * específico do relatório `docs/auditorias/2026-08-04-auditoria-estoque.md`.
 * São testes de COMPORTAMENTO pelo caminho público (caller tRPC + banco real),
 * então sobrevivem a refactor da implementação.
 *
 * Roda contra o Postgres local com RLS ligada — o mesmo caminho que produção
 * usa (`withTenant` → `SET LOCAL app.current_tenant_id`).
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
vi.mock("@/server/auth", () => ({ auth: async () => null }));
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createCallerFactory } from "@/server/api/trpc";
import { appRouter } from "@/server/api/root";
import { withTenant } from "@/server/db";
import { openTestCashSession, closeTestCashSessions } from "../helpers/cash-session";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const MARK = "audit-0804";
let tenantId: string;
let adminId: string;
let adminCtx: any;

const productIds: string[] = [];
const purchaseIds: string[] = [];
const customerIds: string[] = [];
const cashSessionIds: string[] = [];
const orderIds: string[] = [];
const saleIds: string[] = [];

const call = () => createCallerFactory(appRouter)(adminCtx);

/**
 * Caixa aberto do admin. Usa o helper compartilhado: a unique parcial
 * `cash_sessions_one_open_per_user` faz `create` direto estourar quando outro
 * arquivo deixou caixa aberto para o mesmo usuário.
 */
async function openCashSession(): Promise<string> {
  const s = await openTestCashSession(prisma, { tenantId, userId: adminId });
  cashSessionIds.push(s.id);
  return s.id;
}

async function closeAnyOpenSession() {
  await closeTestCashSessions(prisma, { tenantId, userId: adminId });
}

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
    withTenant: (fn: any) => withTenant(tenantId, fn),
  };
});

afterAll(async () => {
  for (const id of purchaseIds) {
    const fts = await prisma.financialTransaction.findMany({
      where: { referenceType: "device_purchase", referenceId: id },
      select: { id: true },
    });
    const ftIds = fts.map((f) => f.id);
    if (ftIds.length > 0) {
      await prisma.installmentPayment.deleteMany({ where: { transactionId: { in: ftIds } } });
      await prisma.installment.deleteMany({ where: { transactionId: { in: ftIds } } });
      await prisma.financialTransaction.deleteMany({ where: { id: { in: ftIds } } });
    }
    await prisma.cashMovement.deleteMany({ where: { referenceId: id } });
    // Movimentos de estoque referenciam a compra por `referenceId` (entrada da
    // compra e saída do cancelamento).
    await prisma.stockMovement.deleteMany({ where: { referenceId: id } });
  }
  await prisma.devicePurchase.deleteMany({ where: { id: { in: purchaseIds } } });
  for (const id of orderIds) {
    const fts = await prisma.financialTransaction.findMany({
      where: { serviceOrderId: id },
      select: { id: true },
    });
    const ftIds = fts.map((f) => f.id);
    if (ftIds.length > 0) {
      await prisma.installmentPayment.deleteMany({ where: { transactionId: { in: ftIds } } });
      await prisma.installment.deleteMany({ where: { transactionId: { in: ftIds } } });
      await prisma.financialTransaction.deleteMany({ where: { id: { in: ftIds } } });
    }
    await prisma.cashMovement.deleteMany({ where: { referenceId: id } });
    await prisma.serviceOrderHistory.deleteMany({ where: { orderId: id } });
    await prisma.serviceOrderItem.deleteMany({ where: { orderId: id } });
  }
  await prisma.serviceOrder.deleteMany({ where: { id: { in: orderIds } } });
  for (const sid of saleIds) {
    const fts = await prisma.financialTransaction.findMany({
      where: { saleId: sid },
      select: { id: true },
    });
    const ftIds = fts.map((f) => f.id);
    if (ftIds.length > 0) {
      await prisma.installmentPayment.deleteMany({ where: { transactionId: { in: ftIds } } });
      await prisma.installment.deleteMany({ where: { transactionId: { in: ftIds } } });
      await prisma.financialTransaction.deleteMany({ where: { id: { in: ftIds } } });
    }
    await prisma.cashMovement.deleteMany({ where: { referenceId: sid } });
    await prisma.stockMovement.deleteMany({ where: { referenceId: sid } });
    await prisma.cardReceivable.deleteMany({ where: { saleId: sid } });
    await prisma.saleUpgrade.deleteMany({ where: { saleId: sid } });
    await prisma.saleItem.deleteMany({ where: { saleId: sid } });
  }
  await prisma.sale.deleteMany({ where: { id: { in: saleIds } } });
  for (const p of productIds) {
    await prisma.stockMovement.deleteMany({ where: { productId: p } });
    await prisma.stockItem.deleteMany({ where: { productId: p } });
    await prisma.productVariation.deleteMany({ where: { productId: p } });
    await prisma.product.deleteMany({ where: { id: p } });
  }
  await prisma.customer.deleteMany({ where: { id: { in: customerIds } } });
  // FECHA em vez de apagar: apagar sessão com movimentos estoura a FK e derruba
  // o afterAll inteiro (o arquivo aparece como "skipped", não como falha).
  await closeTestCashSessions(prisma, { tenantId, userId: adminId });
  await prisma.$disconnect();
});

async function makeDeviceProduct(): Promise<string> {
  const p = await prisma.product.create({
    data: {
      tenantId,
      name: `${MARK}-device-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      salePrice: 1000,
      costPrice: 500,
      isSerialized: true,
      isDevice: true,
      hasVariations: false,
      active: true,
    },
  });
  productIds.push(p.id);
  return p.id;
}

/**
 * IMEI de 15 dígitos com dígito verificador de Luhn válido — o validador exige
 * (defesa em profundidade), então dígito aleatório puro seria rejeitado por
 * motivo errado e o teste não provaria nada.
 */
let imeiCounter = 0;
function makeImei(): string {
  const base = String(35000000000000 + (imeiCounter += 1) + Math.floor(Math.random() * 100000)).slice(0, 14);
  let sum = 0;
  let alt = true; // posição 14 (índice 13) é a primeira a dobrar, indo da direita
  for (let i = base.length - 1; i >= 0; i--) {
    let n = Number(base[i]);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  const check = (10 - (sum % 10)) % 10;
  return `${base}${check}`;
}

async function makeCustomer(): Promise<string> {
  const c = await prisma.customer.create({
    data: {
      tenantId,
      name: `${MARK}-cliente-${Date.now()}`,
      cpf: String(Math.floor(10000000000 + Math.random() * 89999999999)).slice(0, 11),
      phone: "86999990000",
    },
  });
  customerIds.push(c.id);
  return c.id;
}

/** Forma de pagamento em DINHEIRO do tenant (a que move a gaveta). */
async function cashPaymentMethodId(): Promise<string> {
  const existing = await prisma.paymentMethod.findFirst({
    where: { tenantId, type: "CASH", active: true },
  });
  if (existing) return existing.id;
  const created = await prisma.paymentMethod.create({
    data: { tenantId, name: "Dinheiro", type: "CASH", active: true },
  });
  return created.id;
}

describe("Auditoria estoque 2026-08-04 — compra de aparelho x financeiro", () => {
  it("P0-3: compra SEM forma de pagamento é rejeitada (não entra aparelho sem rastro financeiro)", async () => {
    const productId = await makeDeviceProduct();
    const customerId = await makeCustomer();

    // Antes da correção isto retornava sucesso: criava DevicePurchase +
    // StockItem avaliado e NENHUM lançamento financeiro — o custo sumia da
    // despesa e voltava no CMV da revenda (lucro superestimado).
    await expect(
      call().stock.createPurchase({
        productId,
        sellerType: "customer",
        customerId,
        imei: makeImei(),
        condition: "USED",
        purchasePrice: 300000,
        // paymentMode ausente de propósito
      } as any),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    const orphans = await prisma.devicePurchase.count({
      where: { tenantId, productId },
    });
    expect(orphans).toBe(0);
  });

  it("P1-1: pagar em DINHEIRO sem caixa aberto é rejeitado (não some da gaveta em silêncio)", async () => {
    const productId = await makeDeviceProduct();
    const customerId = await makeCustomer();
    const methodId = await cashPaymentMethodId();
    await closeAnyOpenSession();

    // Antes: o `if (openSession)` sem `else` deixava passar — FT PAID criada,
    // nenhum CashMovement. No fechamento aparecia falta fantasma.
    await expect(
      call().stock.createPurchase({
        productId,
        sellerType: "customer",
        customerId,
        imei: makeImei(),
        condition: "USED",
        purchasePrice: 250000,
        paymentMode: "now",
        paymentMethodId: methodId,
      } as any),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("P0-4: cancelar compra paga estorna o LEDGER (despesa não fica presa no DRE)", async () => {
    const productId = await makeDeviceProduct();
    const customerId = await makeCustomer();
    const methodId = await cashPaymentMethodId();
    await openCashSession();

    const purchase = await call().stock.createPurchase({
      productId,
      sellerType: "customer",
      customerId,
      imei: makeImei(),
      condition: "USED",
      purchasePrice: 300000,
      paymentMode: "now",
      paymentMethodId: methodId,
    } as any);
    purchaseIds.push(purchase.id);

    const ft = await prisma.financialTransaction.findFirstOrThrow({
      where: { referenceType: "device_purchase", referenceId: purchase.id },
      select: { id: true },
    });

    const before = await prisma.installmentPayment.aggregate({
      where: { transactionId: ft.id },
      _sum: { amountCents: true },
    });
    expect(before._sum.amountCents).toBe(300000);

    await call().stock.cancelPurchase({ id: purchase.id, reason: "teste de auditoria" });

    // O DRE e o "pago no mês" leem SOMA do ledger sem olhar status da FT.
    // Sem a linha negativa, a despesa cancelada ficava para sempre.
    const after = await prisma.installmentPayment.aggregate({
      where: { transactionId: ft.id },
      _sum: { amountCents: true },
    });
    expect(after._sum.amountCents).toBe(0);
  });

  it("P0-4: cancelar compra A PRAZO parcialmente paga também estorna o ledger", async () => {
    const productId = await makeDeviceProduct();
    const customerId = await makeCustomer();
    await openCashSession();

    const purchase = await call().stock.createPurchase({
      productId,
      sellerType: "customer",
      customerId,
      imei: makeImei(),
      condition: "USED",
      purchasePrice: 200000,
      paymentMode: "payable",
      payableInstallments: 2,
    } as any);
    purchaseIds.push(purchase.id);

    const ft = await prisma.financialTransaction.findFirstOrThrow({
      where: { referenceType: "device_purchase", referenceId: purchase.id },
      select: { id: true },
    });
    const firstInstallment = await prisma.installment.findFirstOrThrow({
      where: { transactionId: ft.id },
      orderBy: { number: "asc" },
      select: { id: true },
    });

    // Paga a 1ª parcela pela porta oficial (grava no ledger).
    await call().financial.payInstallment({
      installmentId: firstInstallment.id,
      amountPaid: 100000,
      paymentMethod: "dinheiro",
    } as any);

    const paidLedger = await prisma.installmentPayment.aggregate({
      where: { transactionId: ft.id },
      _sum: { amountCents: true },
    });
    expect(paidLedger._sum.amountCents).toBe(100000);

    await call().stock.cancelPurchase({ id: purchase.id, reason: "aparelho devolvido" });

    // O que já tinha sido pago não pode continuar contando como despesa.
    const afterLedger = await prisma.installmentPayment.aggregate({
      where: { transactionId: ft.id },
      _sum: { amountCents: true },
    });
    expect(afterLedger._sum.amountCents).toBe(0);
  });

  it("P1-3: compra à vista nasce categorizada no financeiro", async () => {
    const productId = await makeDeviceProduct();
    const customerId = await makeCustomer();
    const methodId = await cashPaymentMethodId();
    await openCashSession();

    const purchase = await call().stock.createPurchase({
      productId,
      sellerType: "customer",
      customerId,
      imei: makeImei(),
      condition: "USED",
      purchasePrice: 150000,
      paymentMode: "now",
      paymentMethodId: methodId,
    } as any);
    purchaseIds.push(purchase.id);

    const ft = await prisma.financialTransaction.findFirstOrThrow({
      where: { referenceType: "device_purchase", referenceId: purchase.id },
      select: { categoryId: true, category: true },
    });
    expect(ft.categoryId).not.toBeNull();
    expect(ft.category).toBeTruthy();
  });

  it("P1-2: a saída de caixa entra na sessão do PRÓPRIO usuário", async () => {
    const productId = await makeDeviceProduct();
    const customerId = await makeCustomer();
    const methodId = await cashPaymentMethodId();
    const sessionId = await openCashSession();

    const purchase = await call().stock.createPurchase({
      productId,
      sellerType: "customer",
      customerId,
      imei: makeImei(),
      condition: "USED",
      purchasePrice: 90000,
      paymentMode: "now",
      paymentMethodId: methodId,
    } as any);
    purchaseIds.push(purchase.id);

    const mv = await prisma.cashMovement.findFirstOrThrow({
      where: { referenceType: "device_purchase", referenceId: purchase.id },
      select: { cashSessionId: true, nature: true },
    });
    expect(mv.cashSessionId).toBe(sessionId);
    expect(mv.nature).toBe("OUTCOME");
  });

  it("P2: parcela nunca nasce negativa e a soma bate com o total (R$1,00 em 36x)", async () => {
    const productId = await makeDeviceProduct();
    const customerId = await makeCustomer();

    // Com `Math.round`, 100/36 dava 3 centavos por parcela → 3×36=108 > 100 →
    // resto -8 → a ÚLTIMA parcela nascia com -5 centavos, corrompendo os
    // agregados de pendente/vencido e sem poder ser quitada. Com `Math.floor`
    // o resto é sempre >= 0 e a última parcela é a maior.
    const purchase = await call().stock.createPurchase({
      productId,
      sellerType: "customer",
      customerId,
      imei: makeImei(),
      condition: "USED",
      purchasePrice: 100,
      paymentMode: "payable",
      payableInstallments: 36,
    } as any);
    purchaseIds.push(purchase.id);

    const ft = await prisma.financialTransaction.findFirstOrThrow({
      where: { referenceType: "device_purchase", referenceId: purchase.id },
      select: { id: true },
    });
    const installments = await prisma.installment.findMany({
      where: { transactionId: ft.id },
      select: { amount: true },
    });

    expect(installments).toHaveLength(36);
    const cents = installments.map((i) => Math.round(Number(i.amount) * 100));
    expect(Math.min(...cents)).toBeGreaterThan(0);
    expect(cents.reduce((a, b) => a + b, 0)).toBe(100);
  });

  it("P2: valor baixo demais para o nº de parcelas é rejeitado", async () => {
    const productId = await makeDeviceProduct();
    const customerId = await makeCustomer();

    // R$1,00 em 101x seria 0 centavo por parcela — parcela de valor zero não é
    // cobrável. O schema barra antes de criar qualquer coisa.
    await expect(
      call().stock.createPurchase({
        productId,
        sellerType: "customer",
        customerId,
        imei: makeImei(),
        condition: "USED",
        purchasePrice: 30,
        paymentMode: "payable",
        payableInstallments: 36,
      } as any),
    ).rejects.toThrow();
  });

  it("P2: data de vencimento inválida é rejeitada com mensagem de campo", async () => {
    const productId = await makeDeviceProduct();
    const customerId = await makeCustomer();

    await expect(
      call().stock.createPurchase({
        productId,
        sellerType: "customer",
        customerId,
        imei: makeImei(),
        condition: "USED",
        purchasePrice: 120000,
        paymentMode: "payable",
        payableInstallments: 3,
        payableFirstDueDate: "lixo-nao-e-data",
      } as any),
    ).rejects.toThrow();
  });
});

describe("Auditoria estoque 2026-08-04 — kardex e duplo-submit", () => {
  it("P1-10: ajuste de estoque grava saldo antes/depois (kardex reconstruível)", async () => {
    const product = await prisma.product.create({
      data: {
        tenantId,
        name: `${MARK}-kardex-${Date.now()}`,
        salePrice: 100,
        costPrice: 50,
        currentStock: 20,
        isSerialized: false,
        hasVariations: false,
        active: true,
      },
    });
    productIds.push(product.id);

    await call().stock.adjustStock({
      productId: product.id,
      quantity: 5,
      reason: "entrada de teste",
    } as any);
    await call().stock.adjustStock({
      productId: product.id,
      quantity: -3,
      reason: "saida de teste",
    } as any);

    const movements = await prisma.stockMovement.findMany({
      where: { productId: product.id },
      orderBy: { createdAt: "asc" },
      select: { type: true, quantity: true, quantityBefore: true, quantityAfter: true },
    });

    expect(movements).toHaveLength(2);
    // Antes, before/after eram NULL nesta procedure: o extrato tinha um furo a
    // cada ajuste e não dava para reconstruir o saldo numa data.
    expect(movements[0]).toMatchObject({ quantityBefore: 20, quantityAfter: 25 });
    expect(movements[1]).toMatchObject({ quantityBefore: 25, quantityAfter: 22 });
    // A cadeia fecha: o "depois" de um é o "antes" do próximo.
    expect(movements[0]!.quantityAfter).toBe(movements[1]!.quantityBefore);
  });

  it("P1-8: duplo-submit da MESMA compra não cria duas — o IMEI barra o retry", async () => {
    const productId = await makeDeviceProduct();
    const customerId = await makeCustomer();
    await openCashSession();

    const input = {
      productId,
      sellerType: "customer" as const,
      customerId,
      imei: makeImei(),
      condition: "USED" as const,
      purchasePrice: 80000,
      paymentMode: "payable" as const,
    };

    const first = await call().stock.createPurchase(input as any);
    purchaseIds.push(first.id);

    // A auditoria levantou a hipótese de duplo-pagamento em aparelho SEM
    // identificador (AirPods/iPad WiFi). Ela NÃO se confirma: o validador exige
    // IMEI ou serial (`Informe IMEI ou numero de serie do aparelho`), então o
    // caminho sem identificador é inalcançável pela API e o índice único
    // parcial de IMEI cobre o retry. Este teste fixa esse invariante — se
    // alguém afrouxar a exigência, o duplo-pagamento volta a ser possível e
    // aqui é o lugar de perceber.
    await expect(call().stock.createPurchase(input as any)).rejects.toMatchObject({
      code: "CONFLICT",
    });

    const count = await prisma.devicePurchase.count({
      where: { tenantId, productId, cancelledAt: null },
    });
    expect(count).toBe(1);
  });
});

describe("Auditoria estoque 2026-08-04 — estorno de OS devolve peças", () => {
  it("P0-2: estornar OS paga devolve a peça consumida ao estoque", async () => {
    const product = await prisma.product.create({
      data: {
        tenantId,
        name: `${MARK}-peca-${Date.now()}`,
        salePrice: 180,
        costPrice: 90,
        currentStock: 10,
        isSerialized: false,
        hasVariations: false,
        active: true,
      },
    });
    productIds.push(product.id);

    const customerId = await makeCustomer();
    const order = await prisma.serviceOrder.create({
      data: {
        tenantId,
        number: `${MARK}-os-${Date.now()}`,
        customerId,
        createdById: adminId,
        status: "IN_PROGRESS",
        publicLink: `${MARK}-pl-${Date.now()}`,
        totalAmount: 180,
        serviceAmount: 0,
      },
    });
    orderIds.push(order.id);

    // Consome a peça pela porta oficial (reserva estoque + grava movimento).
    await call().serviceOrder.addItem({
      orderId: order.id,
      type: "PRODUCT",
      productId: product.id,
      description: "Tela",
      quantity: 1,
      unitPrice: 18000,
    } as any);

    const afterConsume = await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
      select: { currentStock: true },
    });
    expect(afterConsume.currentStock).toBe(9);

    await openCashSession();
    await prisma.serviceOrder.update({
      where: { id: order.id },
      data: {
        status: "PAID",
        paidAmount: 180,
        paymentDate: new Date(),
        paymentMethod: "dinheiro",
      },
    });

    await call().serviceOrder.refund({ id: order.id, reason: "cliente desistiu do reparo" });

    // Antes: o estorno devolvia dinheiro, recebível e comissão — mas a peça
    // ficava consumida para sempre, sem remédio pela UI.
    const afterRefund = await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
      select: { currentStock: true },
    });
    expect(afterRefund.currentStock).toBe(10);
  });
});

describe("Auditoria estoque 2026-08-04 — trade-in", () => {
  it("P1-5/P1-6: estorno total devolve o aparelho de entrada e tira do estoque", async () => {
    const sellProduct = await prisma.product.create({
      data: {
        tenantId,
        name: `${MARK}-vendido-${Date.now()}`,
        salePrice: 100,
        costPrice: 50,
        currentStock: 50,
        isSerialized: false,
        hasVariations: false,
        active: true,
      },
    });
    productIds.push(sellProduct.id);
    const customerId = await makeCustomer();
    const tradeInImei = makeImei();
    await openCashSession();

    const draft = await call().sale.createDraft();
    saleIds.push(draft.id);
    await call().sale.setCustomer({ saleId: draft.id, customerId } as any);
    await call().sale.addItem({
      saleId: draft.id,
      productId: sellProduct.id,
      quantity: 1,
      unitPrice: 10000,
    } as any);
    await call().sale.addUpgrade({
      saleId: draft.id,
      brand: "Apple",
      model: `${MARK} iPhone`,
      imei: tradeInImei,
      condition: "USED",
      appraisedValue: 3000,
      abatedValue: 3000,
    } as any);
    await call().sale.finalize({
      saleId: draft.id,
      payments: [{ method: "dinheiro", amount: 7000 }],
    } as any);

    // O aparelho de entrada virou StockItem vendável e uma DevicePurchase.
    const tradeInItem = await prisma.stockItem.findFirstOrThrow({
      where: { tenantId, imei: tradeInImei, deletedAt: null },
      select: { id: true, status: true, productId: true },
    });
    expect(tradeInItem.status).toBe("AVAILABLE");
    productIds.push(tradeInItem.productId);

    const tradeInPurchase = await prisma.devicePurchase.findFirstOrThrow({
      where: { tenantId, imei: tradeInImei },
      select: { id: true, productId: true },
    });
    purchaseIds.push(tradeInPurchase.id);
    // P1-5: sem productId, `cancelPurchase` nunca removeria o StockItem.
    expect(tradeInPurchase.productId).toBe(tradeInItem.productId);

    await call().sale.refund({ saleId: draft.id, reason: "cliente desistiu da troca" } as any);

    // P1-6: a loja devolveu o aparelho ao cliente — ele não pode continuar
    // vendável no estoque.
    const afterRefund = await prisma.stockItem.findUniqueOrThrow({
      where: { id: tradeInItem.id },
      select: { deletedAt: true },
    });
    expect(afterRefund.deletedAt).not.toBeNull();
  });
});

describe("Auditoria estoque 2026-08-04 — OS com variação", () => {
  it("P2: cancelar e descancelar OS não infla o saldo da variação", async () => {
    const product = await prisma.product.create({
      data: {
        tenantId,
        name: `${MARK}-osvar-${Date.now()}`,
        salePrice: 200,
        costPrice: 100,
        isSerialized: false,
        hasVariations: true,
        active: true,
      },
    });
    productIds.push(product.id);
    const variation = await prisma.productVariation.create({
      data: { tenantId, productId: product.id, currentStock: 10, active: true },
    });

    const customerId = await makeCustomer();
    const order = await prisma.serviceOrder.create({
      data: {
        tenantId,
        number: `${MARK}-osv-${Date.now()}`,
        customerId,
        createdById: adminId,
        status: "IN_PROGRESS",
        publicLink: `${MARK}-plv-${Date.now()}`,
        totalAmount: 200,
        serviceAmount: 0,
      },
    });
    orderIds.push(order.id);

    await call().serviceOrder.addItem({
      orderId: order.id,
      type: "PRODUCT",
      productId: product.id,
      variationId: variation.id,
      description: "Bateria",
      quantity: 2,
      unitPrice: 10000,
    } as any);

    const consumed = await prisma.productVariation.findUniqueOrThrow({
      where: { id: variation.id },
      select: { currentStock: true },
    });
    expect(consumed.currentStock).toBe(8);

    await call().serviceOrder.cancel({ id: order.id, reason: "cliente desistiu" } as any);
    await call().serviceOrder.uncancel({
      id: order.id,
      reason: "cliente voltou atras",
    } as any);

    // Antes: cancelar creditava a VARIAÇÃO (+2 → 10) e descancelar debitava o
    // PRODUTO PAI (que ninguém lê), deixando a variação em 10 para sempre.
    const afterRoundTrip = await prisma.productVariation.findUniqueOrThrow({
      where: { id: variation.id },
      select: { currentStock: true },
    });
    expect(afterRoundTrip.currentStock).toBe(8);
  });
});

describe("Auditoria estoque 2026-08-04 — variações", () => {
  it("P0-1: editar produto NÃO apaga variação com saldo (nem perde o saldo)", async () => {
    const product = await prisma.product.create({
      data: {
        tenantId,
        name: `${MARK}-var-${Date.now()}`,
        salePrice: 1000,
        costPrice: 500,
        isSerialized: false,
        hasVariations: true,
        active: true,
      },
    });
    productIds.push(product.id);

    const attr = await prisma.productAttribute.upsert({
      where: { tenantId_slug: { tenantId, slug: `${MARK}-cor` } },
      create: { tenantId, name: `${MARK} Cor`, slug: `${MARK}-cor` },
      update: {},
    });
    const azul = await prisma.productAttributeValue.upsert({
      where: { attributeId_value: { attributeId: attr.id, value: "Azul" } },
      create: { tenantId, attributeId: attr.id, value: "Azul" },
      update: {},
    });
    const preto = await prisma.productAttributeValue.upsert({
      where: { attributeId_value: { attributeId: attr.id, value: "Preto" } },
      create: { tenantId, attributeId: attr.id, value: "Preto" },
      update: {},
    });

    const varAzul = await prisma.productVariation.create({
      data: { tenantId, productId: product.id, currentStock: 47, active: true },
    });
    await prisma.productVariationAttribute.create({
      data: { variationId: varAzul.id, attributeValueId: azul.id },
    });

    // O operador adiciona uma variação nova e salva. Antes: as existentes eram
    // HARD DELETADAS e recriadas com currentStock 0 — 47 unidades sumiam sem
    // nenhum StockMovement.
    await call().stock.update({
      id: product.id,
      name: product.name,
      costPrice: 50000,
      salePrice: 100000,
      hasVariations: true,
      variations: [
        // A variação existente vai com `id` — é assim que o formulário passa a
        // mandar. Sem o id, o backend não tem como saber que é a MESMA linha.
        { id: varAzul.id, attributeValueIds: [azul.id] },
        { attributeValueIds: [preto.id] },
      ],
    } as any);

    const total = await prisma.productVariation.aggregate({
      where: { productId: product.id, deletedAt: null, active: true },
      _sum: { currentStock: true },
    });
    expect(total._sum.currentStock).toBe(47);

    const stillThere = await prisma.productVariation.findUnique({
      where: { id: varAzul.id },
      select: { currentStock: true, deletedAt: true },
    });
    expect(stillThere).not.toBeNull();
    expect(stillThere!.currentStock).toBe(47);
  });

  it("P0-1: remover variação COM saldo é rejeitado (rede de segurança do backend)", async () => {
    const product = await prisma.product.create({
      data: {
        tenantId,
        name: `${MARK}-var-guard-${Date.now()}`,
        salePrice: 1000,
        costPrice: 500,
        isSerialized: false,
        hasVariations: true,
        active: true,
      },
    });
    productIds.push(product.id);

    const attr = await prisma.productAttribute.upsert({
      where: { tenantId_slug: { tenantId, slug: `${MARK}-cor` } },
      create: { tenantId, name: `${MARK} Cor`, slug: `${MARK}-cor` },
      update: {},
    });
    const verde = await prisma.productAttributeValue.upsert({
      where: { attributeId_value: { attributeId: attr.id, value: "Verde" } },
      create: { tenantId, attributeId: attr.id, value: "Verde" },
      update: {},
    });

    await prisma.productVariation.create({
      data: { tenantId, productId: product.id, currentStock: 12, active: true },
    });

    // Sem `id` na lista, a variação com saldo seria "removida". O backend não
    // pode confiar no cliente: rejeita em vez de apagar 12 unidades.
    await expect(
      call().stock.update({
        id: product.id,
        name: product.name,
        costPrice: 50000,
        salePrice: 100000,
        hasVariations: true,
        variations: [{ attributeValueIds: [verde.id] }],
      } as any),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    const total = await prisma.productVariation.aggregate({
      where: { productId: product.id, deletedAt: null },
      _sum: { currentStock: true },
    });
    expect(total._sum.currentStock).toBe(12);
  });
});
