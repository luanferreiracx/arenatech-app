/**
 * Conta do dinheiro no ledger de pagamentos (ADR 0069).
 *
 * A queixa que originou isto: "informamos apenas que é PIX e já passa, não se
 * escolhe conta". Estes testes provam, pelo caminho público, que agora o
 * sistema sabe DE ONDE o dinheiro saiu — e que o saldo por conta fecha.
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

const MARK = "adr69";
let tenantId: string;
let adminId: string;
let ctx: any;

const accountIds: string[] = [];
const productIds: string[] = [];
const purchaseIds: string[] = [];
const customerIds: string[] = [];
const methodIds: string[] = [];

const call = () => createCallerFactory(appRouter)(ctx);

beforeAll(async () => {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "arena-tech" } });
  const admin = await prisma.user.findFirstOrThrow({ where: { name: "Admin Arena" } });
  tenantId = tenant.id;
  adminId = admin.id;
  ctx = {
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
    await prisma.stockMovement.deleteMany({ where: { referenceId: id } });
  }
  await prisma.devicePurchase.deleteMany({ where: { id: { in: purchaseIds } } });
  for (const p of productIds) {
    await prisma.stockMovement.deleteMany({ where: { productId: p } });
    await prisma.stockItem.deleteMany({ where: { productId: p } });
    await prisma.product.deleteMany({ where: { id: p } });
  }
  await prisma.customer.deleteMany({ where: { id: { in: customerIds } } });
  // Desfaz o vínculo antes de apagar a conta (FK SET NULL cobriria, mas
  // deixar explícito evita depender do comportamento da constraint).
  await prisma.paymentMethod.updateMany({
    where: { id: { in: methodIds } },
    data: { defaultReceivingAccountId: null },
  });
  await prisma.paymentMethod.deleteMany({ where: { id: { in: methodIds } } });
  await prisma.receivingAccount.deleteMany({ where: { id: { in: accountIds } } });
  await closeTestCashSessions(prisma, { tenantId, userId: adminId });
  await prisma.$disconnect();
});

let seq = 0;
async function makeAccount(
  name: string,
  opts: { isDefault?: boolean; active?: boolean } = {},
): Promise<string> {
  seq += 1;
  const a = await prisma.receivingAccount.create({
    data: {
      tenantId,
      name: `${MARK}-${name}-${Date.now()}-${seq}`,
      type: "BANK",
      isDefault: opts.isDefault ?? false,
      active: opts.active ?? true,
    },
  });
  accountIds.push(a.id);
  return a.id;
}

/** Zera o `isDefault` do tenant — o índice único parcial só admite um. */
async function clearTenantDefault() {
  await prisma.receivingAccount.updateMany({
    where: { tenantId, isDefault: true },
    data: { isDefault: false },
  });
}

async function makeCashMethod(defaultAccountId?: string | null): Promise<string> {
  seq += 1;
  const m = await prisma.paymentMethod.create({
    data: {
      tenantId,
      name: `${MARK}-Dinheiro-${Date.now()}-${seq}`,
      type: "CASH",
      active: true,
      defaultReceivingAccountId: defaultAccountId ?? null,
    },
  });
  methodIds.push(m.id);
  return m.id;
}

let imeiCounter = 0;
function makeImei(): string {
  const base = String(35000000000000 + (imeiCounter += 1) + Math.floor(Math.random() * 100000)).slice(0, 14);
  let sum = 0;
  let alt = true;
  for (let i = base.length - 1; i >= 0; i--) {
    let n = Number(base[i]);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return `${base}${(10 - (sum % 10)) % 10}`;
}

async function makeDeviceProduct(): Promise<string> {
  const p = await prisma.product.create({
    data: {
      tenantId,
      name: `${MARK}-device-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      salePrice: 1000,
      costPrice: 500,
      isSerialized: true,
      isDevice: true,
      active: true,
    },
  });
  productIds.push(p.id);
  return p.id;
}

async function makeCustomer(): Promise<string> {
  const c = await prisma.customer.create({
    data: {
      tenantId,
      name: `${MARK}-cli-${Date.now()}`,
      cpf: String(Math.floor(10000000000 + Math.random() * 89999999999)).slice(0, 11),
      phone: "86999990000",
    },
  });
  customerIds.push(c.id);
  return c.id;
}

/** Compra de aparelho paga à vista, devolvendo a linha do ledger. */
async function buyDevice(opts: {
  methodId: string;
  receivingAccountId?: string | null;
  priceCents?: number;
}) {
  const productId = await makeDeviceProduct();
  const customerId = await makeCustomer();
  await openTestCashSession(prisma, { tenantId, userId: adminId });

  const purchase = await call().stock.createPurchase({
    productId,
    sellerType: "customer",
    customerId,
    imei: makeImei(),
    condition: "USED",
    purchasePrice: opts.priceCents ?? 200000,
    paymentMode: "now",
    paymentMethodId: opts.methodId,
    receivingAccountId: opts.receivingAccountId ?? undefined,
  } as any);
  purchaseIds.push(purchase.id);

  const ft = await prisma.financialTransaction.findFirstOrThrow({
    where: { referenceType: "device_purchase", referenceId: purchase.id },
    select: { id: true },
  });
  const ledger = await prisma.installmentPayment.findFirstOrThrow({
    where: { transactionId: ft.id },
    select: { receivingAccountId: true, amountCents: true },
  });
  return { purchaseId: purchase.id, transactionId: ft.id, ledger };
}

describe("ADR 0069 — conta do dinheiro no ledger", () => {
  it("compra de aparelho grava a conta ESCOLHIDA pelo operador", async () => {
    const escolhida = await makeAccount("escolhida");
    const method = await makeCashMethod(null);

    const { ledger } = await buyDevice({ methodId: method, receivingAccountId: escolhida });

    // Era exatamente isto que faltava: o sistema sabia "é PIX", nunca "de qual conta".
    expect(ledger.receivingAccountId).toBe(escolhida);
  });

  it("sem escolha, usa a conta padrão da FORMA de pagamento", async () => {
    const nubank = await makeAccount("nubank");
    const method = await makeCashMethod(nubank);

    const { ledger } = await buyDevice({ methodId: method });

    expect(ledger.receivingAccountId).toBe(nubank);
  });

  it("sem conta na forma, cai para a conta padrão do tenant", async () => {
    await clearTenantDefault();
    const padrao = await makeAccount("padrao", { isDefault: true });
    const method = await makeCashMethod(null);

    const { ledger } = await buyDevice({ methodId: method });

    expect(ledger.receivingAccountId).toBe(padrao);
  });

  it("sem nenhuma pista, grava NULL em vez de inventar conta", async () => {
    await clearTenantDefault();
    const method = await makeCashMethod(null);

    const { ledger } = await buyDevice({ methodId: method });

    // Conta errada é pior que conta ausente: dado errado dá falso negativo
    // silencioso na conciliação; nulo aparece como "sem conta" e pede correção.
    expect(ledger.receivingAccountId).toBeNull();
  });

  it("cancelar a compra devolve o dinheiro para a MESMA conta", async () => {
    await clearTenantDefault();
    const conta = await makeAccount("estorno");
    const method = await makeCashMethod(conta);

    const { purchaseId, transactionId } = await buyDevice({ methodId: method, priceCents: 150000 });
    await call().stock.cancelPurchase({ id: purchaseId, reason: "aparelho devolvido" });

    const linhas = await prisma.installmentPayment.findMany({
      where: { transactionId },
      select: { amountCents: true, receivingAccountId: true },
    });

    // Duas linhas (+150000 e -150000), ambas na mesma conta: o líquido da conta
    // volta a zero. Se o estorno caísse noutra conta, o total do tenant fecharia
    // mas as contas ficariam desequilibradas entre si.
    expect(linhas).toHaveLength(2);
    expect(linhas.every((l) => l.receivingAccountId === conta)).toBe(true);
    expect(linhas.reduce((s, l) => s + l.amountCents, 0)).toBe(0);
  });

  it("saldo por conta soma o líquido e separa os lançamentos SEM conta", async () => {
    await clearTenantDefault();
    const conta = await makeAccount("saldo");
    const comConta = await makeCashMethod(conta);
    const semConta = await makeCashMethod(null);

    await buyDevice({ methodId: comConta, priceCents: 120000 });
    await buyDevice({ methodId: semConta, priceCents: 70000 });

    const res = await call().receiving.accounts.balances({});
    const linha = res.accounts.find((a) => a.id === conta);

    // PAYABLE entra no ledger como valor positivo (é o evento de caixa; o sinal
    // de despesa vem do `type` da transação), então o saldo movimentado da
    // conta é 120000.
    expect(linha?.netCents).toBe(120000);
    expect(linha?.movements).toBe(1);
    // A lacuna fica VISÍVEL em vez de sumir — é o que a torna corrigível.
    expect(res.unassigned.netCents).toBeGreaterThanOrEqual(70000);
  });

  it("kardex valorizado: a compra grava o custo REAL no movimento", async () => {
    await clearTenantDefault();
    const method = await makeCashMethod(null);
    const { purchaseId } = await buyDevice({ methodId: method, priceCents: 185000 });

    const movement = await prisma.stockMovement.findFirstOrThrow({
      where: { referenceId: purchaseId, referenceType: "device_purchase" },
      select: { unitCostCents: true, totalCostCents: true, quantity: true },
    });

    // Sem isto o custo histórico se perdia e o CMV de um período passado só
    // podia ser calculado com o `costPrice` de HOJE — que muda a cada compra.
    expect(movement.unitCostCents).toBe(185000);
    expect(movement.totalCostCents).toBe(185000 * movement.quantity);
  });

  it("o banco impede duas contas padrão no mesmo tenant", async () => {
    await clearTenantDefault();
    await makeAccount("primeira", { isDefault: true });

    // Antes a exclusividade era só dois `updateMany` imperativos no router —
    // dois admins concorrentes deixavam duas padrão e a resolução virava
    // não-determinística. Agora é índice único parcial.
    await expect(makeAccount("segunda", { isDefault: true })).rejects.toThrow();
  });
});
