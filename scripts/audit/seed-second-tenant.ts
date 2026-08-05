/**
 * Popula um SEGUNDO tenant operacional na CÓPIA LOCAL do banco de produção.
 *
 * Motivo (auditoria de comercialização, 2026-08-04): só `arena-tech` tem uso
 * real; os outros seis tenants estão vazios. Banco com um único tenant ativo
 * ESCONDE bug de isolamento multi-tenant — a query sem filtro de tenant, o
 * relatório que soma o banco inteiro, o `findFirst` que pega a linha do vizinho.
 * Nada disso aparece enquanto só existe um vizinho, e tudo isso aparece no
 * primeiro cliente pagante. Este script cria o vizinho.
 *
 * O que ele NÃO é: um gerador de dados bonitos. Cada linha respeita os
 * invariantes que o app assume — parcela PAID tem ledger que soma o `paidAmount`,
 * `StockItem` SOLD tem `sale_id`, `CashMovement` tem par type↔nature válido,
 * `InstallmentPayment` tem conta (ADR 0069). Dado corrompido aqui viraria
 * "achado" falso na auditoria.
 *
 * Escreve pelos SERVIÇOS reais (`writeCashMovement`, `recordCashPaidTransaction`,
 * `recordInstallmentPayment`, `tenantFinancialInit`, `startSubscription`,
 * `nextTenantNumber`) sempre que possível — é o que garante que o dado nasça com
 * as mesmas regras da aplicação, e não com a interpretação deste arquivo.
 *
 * NUNCA roda contra produção: aborta se o host do DATABASE_URL não for local.
 * Idempotente: a segunda execução detecta o tenant e não duplica nada.
 *
 * Uso:
 *   DATABASE_URL="postgresql://arenatech:arenatech_local@localhost:5432/arenatech_prod?schema=public" \
 *     pnpm tsx scripts/audit/seed-second-tenant.ts
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashSync } from "bcryptjs";
import { tenantFinancialInit } from "../../src/server/services/tenant-financial-init.service";
import { startSubscription } from "../../src/server/services/subscription-start.service";
import { writeCashMovement } from "../../src/server/services/cash-session.service";
import {
  recordCashPaidTransaction,
  recordInstallmentPayment,
} from "../../src/server/services/installment-ledger.service";
import { nextTenantNumber } from "../../src/server/services/tenant-number-sequence.service";

// ── Guarda de banco local (copiada de prepare-audit-db.ts) ──

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);

function assertLocalDatabase(url: string): void {
  const host = new URL(url).hostname;
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      `Recusado: DATABASE_URL aponta para "${host}". Este script só roda em banco local.`,
    );
  }
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL não definida.");
assertLocalDatabase(databaseUrl);

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

// ── Constantes do tenant de auditoria ──

const TENANT_SLUG = "audit-loja-2";
const TENANT_NAME = "Loja Auditoria 2";
/** Plano mais amplo do catálogo — libera OS, varejo, fiscal e comissões. */
const PLAN_SLUG = "completo";

/**
 * CPFs VÁLIDOS (dígito verificador confere) e distintos dos usados em
 * `prepare-audit-db.ts` (86288366757 / 52998224725) e de todo CPF presente na
 * cópia de produção — colidir sobrescreveria um usuário real via upsert-por-CPF.
 */
const USERS = [
  {
    cpf: "19191919177",
    name: "Auditoria 2 Admin",
    email: "auditoria2.admin@local.invalid",
    password: "Admin@2026",
    role: "admin" as const,
    isTechnician: true,
  },
  {
    cpf: "28282828211",
    name: "Auditoria 2 Operador",
    email: "auditoria2.operador@local.invalid",
    password: "Arena@2026",
    role: "operator" as const,
    isTechnician: false,
  },
] as const;

const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS) || 10;

// ── Utilidades ──

/** Reais → Decimal do Prisma, sem passar por float intermediário. */
function reais(cents: number): Prisma.Decimal {
  return new Prisma.Decimal(cents).div(100);
}

/** Data relativa a hoje, em dias (negativo = passado). */
function daysFromNow(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

/** PRNG determinístico — a mesma execução gera os mesmos dados toda vez. */
function makeRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

const random = makeRandom(20260804);

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(random() * items.length)]!;
}

// ── Catálogo de dados sintéticos ──

const CUSTOMER_NAMES = [
  "Ana Paula Ribeiro",
  "Bruno Carvalho Lima",
  "Camila Souza Freitas",
  "Diego Nogueira Alves",
  "Eduarda Martins Pinto",
  "Felipe Andrade Rocha",
  "Gabriela Teixeira Sá",
  "Henrique Barbosa Melo",
  "Isabela Moreira Duarte",
  "João Vitor Cardoso",
  "Karina Lopes Fontes",
  "Lucas Ferreira Braga",
  "Mariana Castro Vieira",
  "Nathan Oliveira Pires",
  "Patrícia GomesRezende",
] as const;

const DEVICE_PRODUCTS = [
  { name: "iPhone 13 128GB", brand: "Apple", costCents: 250_000, saleCents: 329_900 },
  { name: "iPhone 14 256GB", brand: "Apple", costCents: 380_000, saleCents: 479_900 },
  { name: "iPhone 15 128GB", brand: "Apple", costCents: 480_000, saleCents: 599_900 },
  { name: "Samsung Galaxy S23", brand: "Samsung", costCents: 290_000, saleCents: 379_900 },
  { name: "Samsung Galaxy A54", brand: "Samsung", costCents: 140_000, saleCents: 199_900 },
  { name: "Xiaomi Redmi Note 13", brand: "Xiaomi", costCents: 95_000, saleCents: 139_900 },
  { name: "Motorola Moto G84", brand: "Motorola", costCents: 110_000, saleCents: 159_900 },
  { name: "iPhone 12 64GB (seminovo)", brand: "Apple", costCents: 160_000, saleCents: 219_900 },
] as const;

const ACCESSORY_PRODUCTS = [
  { name: "Capa silicone iPhone 13", brand: "Genérica", costCents: 1_200, saleCents: 4_990 },
  { name: "Película 3D iPhone 14", brand: "Genérica", costCents: 800, saleCents: 3_990 },
  { name: "Carregador 20W USB-C", brand: "Apple", costCents: 4_500, saleCents: 12_990 },
  { name: "Cabo Lightning 1m", brand: "Apple", costCents: 2_500, saleCents: 7_990 },
  { name: "Fone Bluetooth TWS", brand: "JBL", costCents: 8_900, saleCents: 19_990 },
  { name: "Power bank 10000mAh", brand: "Xiaomi", costCents: 6_500, saleCents: 14_990 },
  { name: "Suporte veicular magnético", brand: "Genérica", costCents: 1_800, saleCents: 6_990 },
  { name: "Tela iPhone 13 (peça)", brand: "Apple", costCents: 42_000, saleCents: 79_900 },
  { name: "Bateria Samsung A54 (peça)", brand: "Samsung", costCents: 9_500, saleCents: 24_990 },
  { name: "Conector de carga Xiaomi (peça)", brand: "Xiaomi", costCents: 3_500, saleCents: 11_990 },
  { name: "Cabo USB-C 2m", brand: "Genérica", costCents: 1_500, saleCents: 5_990 },
  { name: "Kit ferramentas reparo", brand: "Genérica", costCents: 5_500, saleCents: 13_990 },
] as const;

const SUPPLIERS = [
  { name: "Distribuidora Nordeste Celulares LTDA", cnpj: "11222333000181", city: "Teresina" },
  { name: "TecParts Importação e Comércio", cnpj: "22333444000172", city: "São Paulo" },
  { name: "Acessórios Brasil Atacado", cnpj: "33444555000163", city: "Fortaleza" },
] as const;

const SERVICE_CATALOG = [
  { name: "Troca de tela", priceCents: 45_000, type: "Reparo" },
  { name: "Troca de bateria", priceCents: 18_000, type: "Reparo" },
  { name: "Limpeza de placa (oxidação)", priceCents: 25_000, type: "Reparo" },
  { name: "Troca de conector de carga", priceCents: 15_000, type: "Reparo" },
  { name: "Diagnóstico técnico", priceCents: 5_000, type: "Diagnóstico" },
] as const;

/** IMEIs sintéticos — prefixo fixo + sequência, para não colidir com os reais. */
function syntheticImei(index: number): string {
  return `35${String(900_000_000_000 + index * 7919).padStart(13, "0")}`.slice(0, 15);
}

// ── Passos do seed ──

type SeedContext = {
  tenantId: string;
  adminUserId: string;
  operatorUserId: string;
  /** Conta de recebimento padrão do tenant ("Caixa da Loja"). */
  receivingAccountId: string;
  paymentMethods: Map<string, { id: string; token: string }>;
};

async function upsertUserByCpf(
  cpf: string,
  data: Omit<Prisma.UserUncheckedCreateInput, "cpf">,
): Promise<{ id: string }> {
  const existing = await prisma.user.findFirst({ where: { cpf }, select: { id: true } });
  if (existing) return prisma.user.update({ where: { id: existing.id }, data });
  return prisma.user.create({ data: { ...data, cpf } });
}

async function seedTenantAndUsers(): Promise<SeedContext> {
  const tenant = await prisma.tenant.upsert({
    where: { slug: TENANT_SLUG },
    update: { name: TENANT_NAME, status: "ACTIVE" },
    create: { slug: TENANT_SLUG, name: TENANT_NAME, status: "ACTIVE" },
    select: { id: true },
  });

  // Fundação financeira: categorias fixas, formas de pagamento, bandeiras,
  // conta de recebimento padrão e config DePix. MESMA função que o cadastro real
  // de tenant chama — não uma reimplementação. Já idempotente por construção.
  await prisma.$transaction((tx) => tenantFinancialInit(tx, tenant.id));

  const plan = await prisma.plan.findUnique({ where: { slug: PLAN_SLUG }, select: { id: true } });
  if (!plan) {
    throw new Error(
      `Plano "${PLAN_SLUG}" não existe nesta base. Rode o seed de planos antes (pnpm prisma db seed).`,
    );
  }
  // `startSubscription` faz upsert por tenantId (1:1) e sincroniza `Tenant.plan`
  // + status ACTIVE. Assinatura paga (não trial) para o tenant não expirar no
  // meio de uma auditoria de vários dias.
  await prisma.$transaction((tx) =>
    startSubscription(tx, {
      tenantId: tenant.id,
      planId: plan.id,
      billingCycle: "MONTHLY",
      asTrial: false,
    }),
  );

  const userIds: string[] = [];
  for (const spec of USERS) {
    const user = await upsertUserByCpf(spec.cpf, {
      name: spec.name,
      email: spec.email,
      passwordHash: hashSync(spec.password, BCRYPT_ROUNDS),
      isSuperAdmin: false,
      mustChangePassword: false,
      twoFactorEnabled: false,
      twoFactorSecret: null,
      twoFactorConfirmedAt: null,
      twoFactorBackupCodes: [],
    });
    await prisma.userTenant.upsert({
      where: { userId_tenantId: { userId: user.id, tenantId: tenant.id } },
      update: { role: spec.role, isCashier: true, isTechnician: spec.isTechnician },
      create: {
        userId: user.id,
        tenantId: tenant.id,
        role: spec.role,
        isCashier: true,
        isTechnician: spec.isTechnician,
      },
    });
    userIds.push(user.id);
  }

  const account = await prisma.receivingAccount.findFirst({
    where: { tenantId: tenant.id, active: true },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    select: { id: true },
  });
  if (!account) throw new Error("tenantFinancialInit não criou conta de recebimento.");

  const methods = await prisma.paymentMethod.findMany({
    where: { tenantId: tenant.id },
    select: { id: true, name: true, code: true, type: true },
  });
  const tokenByType: Record<string, string> = {
    CASH: "dinheiro",
    PIX: "pix",
    CREDIT_CARD: "cartao_credito",
    DEBIT_CARD: "cartao_debito",
    BANK_TRANSFER: "transferencia",
    STORE_CREDIT: "crediario",
    OTHER: "outros",
  };
  const paymentMethods = new Map(
    methods.map((m) => [
      m.name,
      { id: m.id, token: m.code?.trim() || tokenByType[m.type] || "outros" },
    ]),
  );

  return {
    tenantId: tenant.id,
    adminUserId: userIds[0]!,
    operatorUserId: userIds[1]!,
    receivingAccountId: account.id,
    paymentMethods,
  };
}

/** Adquirente + taxas por bandeira — sem isso a venda no cartão não gera recebível. */
async function seedAcquirer(ctx: SeedContext): Promise<{ acquirerId: string; brandIds: string[] }> {
  const acquirer = await prisma.acquirer.upsert({
    where: { tenantId_name: { tenantId: ctx.tenantId, name: "Stone" } },
    update: { receivingAccountId: ctx.receivingAccountId, active: true },
    create: {
      tenantId: ctx.tenantId,
      name: "Stone",
      active: true,
      receivingAccountId: ctx.receivingAccountId,
    },
    select: { id: true },
  });

  const brands = await prisma.cardBrand.findMany({
    where: { tenantId: ctx.tenantId, name: { in: ["Visa", "Mastercard", "Elo"] } },
    select: { id: true },
  });

  for (const brand of brands) {
    // Débito: 1x, D+1. Crédito: 1x a 12x, D+30, taxa crescente.
    await prisma.acquirerRate.upsert({
      where: {
        acquirerId_cardBrandId_kind_installments: {
          acquirerId: acquirer.id,
          cardBrandId: brand.id,
          kind: "DEBIT",
          installments: 1,
        },
      },
      update: {},
      create: {
        tenantId: ctx.tenantId,
        acquirerId: acquirer.id,
        cardBrandId: brand.id,
        kind: "DEBIT",
        installments: 1,
        feePercent: new Prisma.Decimal("1.49"),
        settlementDays: 1,
      },
    });
    for (let n = 1; n <= 12; n++) {
      await prisma.acquirerRate.upsert({
        where: {
          acquirerId_cardBrandId_kind_installments: {
            acquirerId: acquirer.id,
            cardBrandId: brand.id,
            kind: "CREDIT",
            installments: n,
          },
        },
        update: {},
        create: {
          tenantId: ctx.tenantId,
          acquirerId: acquirer.id,
          cardBrandId: brand.id,
          kind: "CREDIT",
          installments: n,
          feePercent: new Prisma.Decimal((3.19 + (n - 1) * 0.35).toFixed(2)),
          settlementDays: 30,
        },
      });
    }
  }

  return { acquirerId: acquirer.id, brandIds: brands.map((b) => b.id) };
}

async function seedCustomers(ctx: SeedContext): Promise<string[]> {
  const ids: string[] = [];
  for (const [index, name] of CUSTOMER_NAMES.entries()) {
    // Sem unique natural para o nome — a idempotência é por (tenant, cpf), que
    // TEM índice único parcial no banco.
    const cpf = SYNTHETIC_CUSTOMER_CPFS[index]!;
    const existing = await prisma.customer.findFirst({
      where: { tenantId: ctx.tenantId, cpf, deletedAt: null },
      select: { id: true },
    });
    if (existing) {
      ids.push(existing.id);
      continue;
    }
    const created = await prisma.customer.create({
      data: {
        tenantId: ctx.tenantId,
        type: "PF",
        name,
        cpf,
        phone: `869${String(80_000_000 + index * 137).padStart(8, "0")}`,
        email: `cliente${index + 1}@auditoria2.local`,
        city: "Teresina",
        state: "PI",
        createdById: ctx.adminUserId,
      },
      select: { id: true },
    });
    ids.push(created.id);
  }
  return ids;
}

async function seedSuppliers(ctx: SeedContext): Promise<string[]> {
  const ids: string[] = [];
  for (const spec of SUPPLIERS) {
    const existing = await prisma.supplier.findFirst({
      where: { tenantId: ctx.tenantId, cnpj: spec.cnpj, deletedAt: null },
      select: { id: true },
    });
    if (existing) {
      ids.push(existing.id);
      continue;
    }
    const created = await prisma.supplier.create({
      data: {
        tenantId: ctx.tenantId,
        type: "PJ",
        name: spec.name,
        cnpj: spec.cnpj,
        city: spec.city,
        state: "PI",
        active: true,
      },
      select: { id: true },
    });
    ids.push(created.id);
  }
  return ids;
}

type SeededProduct = {
  id: string;
  name: string;
  isSerialized: boolean;
  costCents: number;
  saleCents: number;
};

async function seedProducts(ctx: SeedContext, supplierIds: string[]): Promise<SeededProduct[]> {
  const categoryNames = ["Aparelhos", "Acessórios", "Peças"] as const;
  const categories = new Map<string, string>();
  for (const name of categoryNames) {
    const cat = await prisma.productCategory.upsert({
      where: { tenantId_name: { tenantId: ctx.tenantId, name } },
      update: {},
      create: { tenantId: ctx.tenantId, name, active: true },
      select: { id: true },
    });
    categories.set(name, cat.id);
  }

  const brandNames = [...new Set([...DEVICE_PRODUCTS, ...ACCESSORY_PRODUCTS].map((p) => p.brand))];
  const brands = new Map<string, string>();
  for (const name of brandNames) {
    const brand = await prisma.productBrand.upsert({
      where: { tenantId_name: { tenantId: ctx.tenantId, name } },
      update: {},
      create: { tenantId: ctx.tenantId, name, active: true },
      select: { id: true },
    });
    brands.set(name, brand.id);
  }

  const seeded: SeededProduct[] = [];
  let imeiCounter = 0;

  for (const [index, spec] of DEVICE_PRODUCTS.entries()) {
    const sku = `AUD2-APR-${String(index + 1).padStart(3, "0")}`;
    let product = await prisma.product.findFirst({
      where: { tenantId: ctx.tenantId, sku },
      select: { id: true },
    });
    if (!product) {
      product = await prisma.product.create({
        data: {
          tenantId: ctx.tenantId,
          sku,
          name: spec.name,
          brand: spec.brand,
          brandId: brands.get(spec.brand)!,
          categoryId: categories.get("Aparelhos")!,
          isSerialized: true,
          isDevice: true,
          costPrice: reais(spec.costCents),
          salePrice: reais(spec.saleCents),
          // Serializado: a quantidade é derivada dos StockItem AVAILABLE.
          currentStock: 0,
          minStock: 1,
          active: true,
        },
        select: { id: true },
      });
    }
    seeded.push({
      id: product.id,
      name: spec.name,
      isSerialized: true,
      costCents: spec.costCents,
      saleCents: spec.saleCents,
    });

    // Três unidades por modelo: substância para a venda serializada e sobra
    // disponível na tela de estoque.
    for (let unit = 0; unit < 3; unit++) {
      imeiCounter += 1;
      const imei = syntheticImei(index * 10 + unit);
      const exists = await prisma.stockItem.findFirst({
        where: { tenantId: ctx.tenantId, imei },
        select: { id: true },
      });
      if (exists) continue;
      const item = await prisma.stockItem.create({
        data: {
          tenantId: ctx.tenantId,
          productId: product.id,
          supplierId: supplierIds[unit % supplierIds.length]!,
          imei,
          serialNumber: `SN-AUD2-${String(imeiCounter).padStart(5, "0")}`,
          condition: "NEW",
          costPrice: reais(spec.costCents),
          suggestedSalePrice: reais(spec.saleCents),
          status: "AVAILABLE",
          entryDate: daysFromNow(-60 + unit),
        },
        select: { id: true },
      });
      // Kardex da entrada — sem ele o item existe mas o histórico de estoque
      // mente sobre de onde ele veio.
      await prisma.stockMovement.create({
        data: {
          tenantId: ctx.tenantId,
          productId: product.id,
          stockItemId: item.id,
          type: "ENTRY",
          quantity: 1,
          unitCostCents: spec.costCents,
          totalCostCents: spec.costCents,
          reason: "Entrada de estoque (seed de auditoria)",
          userId: ctx.adminUserId,
          createdAt: daysFromNow(-60 + unit),
        },
      });
    }
  }

  for (const [index, spec] of ACCESSORY_PRODUCTS.entries()) {
    const sku = `AUD2-ACS-${String(index + 1).padStart(3, "0")}`;
    const isPart = spec.name.includes("(peça)");
    let product = await prisma.product.findFirst({
      where: { tenantId: ctx.tenantId, sku },
      select: { id: true, currentStock: true },
    });
    const initialStock = 20;
    if (!product) {
      product = await prisma.product.create({
        data: {
          tenantId: ctx.tenantId,
          sku,
          name: spec.name,
          brand: spec.brand,
          brandId: brands.get(spec.brand)!,
          categoryId: categories.get(isPart ? "Peças" : "Acessórios")!,
          isSerialized: false,
          isDevice: false,
          costPrice: reais(spec.costCents),
          salePrice: reais(spec.saleCents),
          currentStock: initialStock,
          minStock: 3,
          active: true,
        },
        select: { id: true, currentStock: true },
      });
      await prisma.stockMovement.create({
        data: {
          tenantId: ctx.tenantId,
          productId: product.id,
          type: "ENTRY",
          quantity: initialStock,
          quantityBefore: 0,
          quantityAfter: initialStock,
          unitCostCents: spec.costCents,
          totalCostCents: spec.costCents * initialStock,
          reason: "Entrada de estoque (seed de auditoria)",
          userId: ctx.adminUserId,
          createdAt: daysFromNow(-55 + index),
        },
      });
    }
    seeded.push({
      id: product.id,
      name: spec.name,
      isSerialized: false,
      costCents: spec.costCents,
      saleCents: spec.saleCents,
    });
  }

  return seeded;
}

async function seedServices(ctx: SeedContext): Promise<Array<{ id: string; name: string; priceCents: number }>> {
  const out: Array<{ id: string; name: string; priceCents: number }> = [];
  const typeIds = new Map<string, string>();
  for (const typeName of [...new Set(SERVICE_CATALOG.map((s) => s.type))]) {
    const slug = typeName.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    const type = await prisma.serviceType.upsert({
      where: { tenantId_slug: { tenantId: ctx.tenantId, slug } },
      update: {},
      create: { tenantId: ctx.tenantId, name: typeName, slug, active: true },
      select: { id: true },
    });
    typeIds.set(typeName, type.id);
  }
  for (const spec of SERVICE_CATALOG) {
    const existing = await prisma.service.findFirst({
      where: { tenantId: ctx.tenantId, name: spec.name, deletedAt: null },
      select: { id: true },
    });
    const id =
      existing?.id ??
      (
        await prisma.service.create({
          data: {
            tenantId: ctx.tenantId,
            name: spec.name,
            serviceTypeId: typeIds.get(spec.type)!,
            serviceType: spec.type,
            basePrice: reais(spec.priceCents),
            active: true,
          },
          select: { id: true },
        })
      ).id;
    out.push({ id, name: spec.name, priceCents: spec.priceCents });
  }
  return out;
}

/**
 * Caixa: uma sessão FECHADA (com conferência) e uma ABERTA.
 *
 * A sessão aberta é do OPERADOR — o índice único parcial
 * `cash_sessions_one_open_per_user` só permite uma aberta por usuário, e é ela
 * que o operador vê ao entrar no PDV.
 */
async function seedCashSessions(ctx: SeedContext): Promise<{ closedId: string; openId: string }> {
  const existingClosed = await prisma.cashSession.findFirst({
    where: { tenantId: ctx.tenantId, closedAt: { not: null } },
    select: { id: true },
  });
  const existingOpen = await prisma.cashSession.findFirst({
    where: { tenantId: ctx.tenantId, closedAt: null },
    select: { id: true },
  });
  if (existingClosed && existingOpen) {
    return { closedId: existingClosed.id, openId: existingOpen.id };
  }

  const closed =
    existingClosed ??
    (await prisma.cashSession.create({
      data: {
        tenantId: ctx.tenantId,
        userId: ctx.operatorUserId,
        initialBalance: reais(20_000),
        openedAt: daysFromNow(-8),
        closedAt: daysFromNow(-8),
        closeType: "MANUAL",
        closedByUserId: ctx.operatorUserId,
        openingNote: "Abertura do dia (seed de auditoria)",
        closingNote: "Fechamento conferido",
        verified: false,
      },
      select: { id: true },
    }));

  const open =
    existingOpen ??
    (await prisma.cashSession.create({
      data: {
        tenantId: ctx.tenantId,
        userId: ctx.operatorUserId,
        initialBalance: reais(15_000),
        openedAt: daysFromNow(0),
        openingNote: "Caixa do dia (seed de auditoria)",
      },
      select: { id: true },
    }));

  return { closedId: closed.id, openId: open.id };
}

type SalePlan = {
  /** "dinheiro" | "pix" | "cartao_credito" | "cartao_debito" | "crediario" */
  methodName: string;
  installments: number;
  /** Vai para a sessão fechada (venda antiga) ou a aberta (venda de hoje)? */
  session: "closed" | "open";
  daysAgo: number;
  /** Produto serializado (aparelho) ou não. */
  serialized: boolean;
};

const SALE_PLANS: SalePlan[] = [
  { methodName: "Dinheiro", installments: 1, session: "closed", daysAgo: 8, serialized: false },
  { methodName: "PIX", installments: 1, session: "closed", daysAgo: 8, serialized: true },
  { methodName: "Cartão de Crédito", installments: 3, session: "closed", daysAgo: 8, serialized: true },
  { methodName: "Cartão de Débito", installments: 1, session: "closed", daysAgo: 8, serialized: false },
  { methodName: "Dinheiro", installments: 1, session: "closed", daysAgo: 8, serialized: false },
  { methodName: "PIX", installments: 1, session: "open", daysAgo: 0, serialized: false },
  { methodName: "Cartão de Crédito", installments: 6, session: "open", daysAgo: 0, serialized: true },
  { methodName: "Dinheiro", installments: 1, session: "open", daysAgo: 0, serialized: false },
  { methodName: "Crediário", installments: 4, session: "open", daysAgo: 0, serialized: false },
  { methodName: "Cartão de Débito", installments: 1, session: "open", daysAgo: 0, serialized: true },
];

async function seedSales(
  ctx: SeedContext,
  customerIds: string[],
  products: SeededProduct[],
  sessions: { closedId: string; openId: string },
  card: { acquirerId: string; brandIds: string[] },
): Promise<number> {
  const already = await prisma.sale.count({ where: { tenantId: ctx.tenantId } });
  if (already >= SALE_PLANS.length) return 0;

  const serialized = products.filter((p) => p.isSerialized);
  const nonSerialized = products.filter((p) => !p.isSerialized);
  let created = 0;

  for (const [index, plan] of SALE_PLANS.entries()) {
    const method = ctx.paymentMethods.get(plan.methodName);
    if (!method) throw new Error(`Forma de pagamento "${plan.methodName}" não encontrada.`);

    const customerId = customerIds[index % customerIds.length]!;
    const saleDate = daysFromNow(-plan.daysAgo);
    const isCard = plan.methodName.startsWith("Cartão");

    await prisma.$transaction(async (tx) => {
      const year = saleDate.getFullYear();
      const { formatted: saleNumber } = await nextTenantNumber(tx, ctx.tenantId, "sale", year, {
        padding: 5,
        prefix: `VND${year}`,
      });

      // ── Itens ──
      type PlannedItem = {
        product: SeededProduct;
        quantity: number;
        stockItemId: string | null;
        imei: string | null;
      };
      const items: PlannedItem[] = [];

      if (plan.serialized) {
        // Reivindica uma unidade AVAILABLE — mesma semântica do finalize
        // (updateMany atômico); se não houver, cai para item não serializado.
        const unit = await tx.stockItem.findFirst({
          where: {
            tenantId: ctx.tenantId,
            status: "AVAILABLE",
            deletedAt: null,
            productId: { in: serialized.map((p) => p.id) },
          },
          orderBy: { createdAt: "asc" },
          select: { id: true, productId: true, imei: true },
        });
        if (unit) {
          const product = serialized.find((p) => p.id === unit.productId)!;
          items.push({ product, quantity: 1, stockItemId: unit.id, imei: unit.imei });
        }
      }
      if (items.length === 0) {
        const product = pick(nonSerialized);
        items.push({ product, quantity: 1 + Math.floor(random() * 2), stockItemId: null, imei: null });
      }
      // Toda venda leva um acessório junto — carrinho de uma linha só não
      // exercita o somatório de itens em tela nenhuma.
      const extra = pick(nonSerialized);
      if (!items.some((i) => i.product.id === extra.id)) {
        items.push({ product: extra, quantity: 1, stockItemId: null, imei: null });
      }

      const subtotalCents = items.reduce((s, i) => s + i.product.saleCents * i.quantity, 0);
      const totalCents = subtotalCents;

      const sale = await tx.sale.create({
        data: {
          tenantId: ctx.tenantId,
          number: saleNumber,
          customerId,
          sellerId: ctx.operatorUserId,
          status: "COMPLETED",
          subtotal: reais(subtotalCents),
          totalAmount: reais(totalCents),
          paidAmount: reais(totalCents),
          netRevenueAmount: reais(totalCents),
          saleDate,
          publicLink: `aud2-${ctx.tenantId.slice(0, 8)}-${saleNumber}`,
          paymentDetails: [
            {
              method: method.token,
              methodLabel: plan.methodName,
              amount: totalCents,
              installments: plan.installments,
            },
          ],
          items: {
            create: items.map((i) => ({
              tenantId: ctx.tenantId,
              productId: i.product.id,
              stockItemId: i.stockItemId,
              description: i.product.name,
              quantity: i.quantity,
              unitPrice: reais(i.product.saleCents),
              costPrice: reais(i.product.costCents),
              total: reais(i.product.saleCents * i.quantity),
              imei: i.imei,
            })),
          },
        },
        select: { id: true },
      });

      // ── Baixa de estoque (invariantes do finalize) ──
      for (const item of items) {
        if (item.stockItemId) {
          // SOLD SEMPRE com sale_id — é o invariante que a auditoria checa.
          const claimed = await tx.stockItem.updateMany({
            where: { id: item.stockItemId, tenantId: ctx.tenantId, status: "AVAILABLE" },
            data: { status: "SOLD", saleId: sale.id, soldAt: saleDate },
          });
          if (claimed.count !== 1) throw new Error("Unidade serializada indisponível no seed.");
        } else {
          // CAS igual ao do finalize: nunca deixa currentStock negativo.
          const decremented = await tx.product.updateMany({
            where: { id: item.product.id, currentStock: { gte: item.quantity } },
            data: { currentStock: { decrement: item.quantity } },
          });
          if (decremented.count !== 1) {
            throw new Error(`Estoque insuficiente para "${item.product.name}" no seed.`);
          }
        }
        await tx.stockMovement.create({
          data: {
            tenantId: ctx.tenantId,
            productId: item.product.id,
            stockItemId: item.stockItemId,
            type: "EXIT",
            quantity: item.quantity,
            reason: `Venda ${saleNumber}`,
            referenceId: sale.id,
            referenceType: "sale",
            userId: ctx.operatorUserId,
            createdAt: saleDate,
          },
        });
      }

      // ── Caixa ──
      const cashSessionId = plan.session === "closed" ? sessions.closedId : sessions.openId;
      await writeCashMovement(tx, {
        tenantId: ctx.tenantId,
        cashSessionId,
        type: "SALE",
        nature: "INCOME",
        amountCents: totalCents,
        paymentMethod: method.token,
        paymentMethodId: method.id,
        description: `Venda ${saleNumber}`,
        referenceId: sale.id,
        referenceType: "SALE",
        createdByUserId: ctx.operatorUserId,
      });

      if (isCard) {
        // Cartão vive no CardReceivable — NÃO gera FinancialTransaction
        // (fonte única: o mesmo dinheiro em dois lugares seria dívida contábil).
        const { generateCardReceivables } = await import(
          "../../src/server/services/card-receivable-writer.service"
        );
        await generateCardReceivables(tx, {
          tenantId: ctx.tenantId,
          saleId: sale.id,
          payment: {
            acquirerId: card.acquirerId,
            cardBrandId: pick(card.brandIds),
            cardKind: plan.methodName.includes("Crédito") ? "CREDIT" : "DEBIT",
            grossCents: totalCents,
            installments: plan.installments,
          },
          createdByUserId: ctx.operatorUserId,
          saleDate,
        });
      } else if (plan.installments > 1) {
        // Crediário: RECEIVABLE parcelado. Primeira parcela paga, resto pendente
        // — é o estado que a tela de recebíveis precisa exercitar.
        const perInstallment = Math.floor(totalCents / plan.installments);
        const remainder = totalCents - perInstallment * plan.installments;
        const ft = await tx.financialTransaction.create({
          data: {
            tenantId: ctx.tenantId,
            type: "RECEIVABLE",
            status: "PARTIALLY_PAID",
            description: `Venda ${saleNumber} - ${method.token}`,
            category: "venda",
            totalAmount: reais(totalCents),
            paidAmount: reais(perInstallment),
            installmentsTotal: plan.installments,
            dueDate: saleDate,
            paymentMethod: method.token,
            paymentMethodId: method.id,
            saleId: sale.id,
            referenceId: sale.id,
            referenceType: "SALE",
            customerId,
            createdByUserId: ctx.operatorUserId,
          },
          select: { id: true },
        });
        for (let n = 1; n <= plan.installments; n++) {
          const amountCents = n === plan.installments ? perInstallment + remainder : perInstallment;
          const dueDate = new Date(saleDate);
          dueDate.setMonth(dueDate.getMonth() + n);
          const isPaid = n === 1;
          const installment = await tx.installment.create({
            data: {
              tenantId: ctx.tenantId,
              transactionId: ft.id,
              number: n,
              amount: reais(amountCents),
              dueDate,
              // Parcela PAID: paidAmount coerente com a soma do ledger abaixo.
              paidAmount: isPaid ? reais(amountCents) : reais(0),
              paidAt: isPaid ? saleDate : null,
              paidByUserId: isPaid ? ctx.operatorUserId : null,
              paymentMethod: isPaid ? method.token : null,
              status: isPaid ? "PAID" : "PENDING",
            },
            select: { id: true },
          });
          if (isPaid) {
            await recordInstallmentPayment(tx, {
              tenantId: ctx.tenantId,
              installmentId: installment.id,
              transactionId: ft.id,
              amountCents,
              paymentMethod: method.token,
              paymentMethodId: method.id,
              paidAt: saleDate,
              createdByUserId: ctx.operatorUserId,
            });
          }
        }
      } else {
        // À vista não-cartão: RECEIVABLE PAID + parcela única + ledger, pelo
        // serviço (é ele que o DRE e o "recebido no mês" leem).
        const ft = await tx.financialTransaction.create({
          data: {
            tenantId: ctx.tenantId,
            type: "RECEIVABLE",
            status: "PAID",
            description: `Venda ${saleNumber} - ${method.token}`,
            category: "venda",
            totalAmount: reais(totalCents),
            paidAmount: reais(totalCents),
            installmentsTotal: 1,
            dueDate: saleDate,
            paidAt: saleDate,
            paymentMethod: method.token,
            paymentMethodId: method.id,
            saleId: sale.id,
            referenceId: sale.id,
            referenceType: "SALE",
            customerId,
            createdByUserId: ctx.operatorUserId,
          },
          select: { id: true },
        });
        await recordCashPaidTransaction(tx, {
          tenantId: ctx.tenantId,
          transactionId: ft.id,
          amountCents: totalCents,
          paidAt: saleDate,
          paymentMethod: method.token,
          paymentMethodId: method.id,
          createdByUserId: ctx.operatorUserId,
        });
      }
    });

    created += 1;
  }

  return created;
}

const OS_PLANS = [
  { status: "OPEN" as const, daysAgo: 2, paid: false },
  { status: "IN_PROGRESS" as const, daysAgo: 5, paid: false },
  { status: "WAITING_APPROVAL" as const, daysAgo: 4, paid: false },
  { status: "COMPLETED" as const, daysAgo: 10, paid: false },
  { status: "DELIVERED" as const, daysAgo: 20, paid: true },
];

async function seedServiceOrders(
  ctx: SeedContext,
  customerIds: string[],
  services: Array<{ id: string; name: string; priceCents: number }>,
  products: SeededProduct[],
  sessions: { closedId: string; openId: string },
): Promise<number> {
  const already = await prisma.serviceOrder.count({ where: { tenantId: ctx.tenantId } });
  if (already >= OS_PLANS.length) return 0;

  const parts = products.filter((p) => !p.isSerialized && p.name.includes("(peça)"));
  let created = 0;

  for (const [index, plan] of OS_PLANS.entries()) {
    const entryDate = daysFromNow(-plan.daysAgo);
    const customerId = customerIds[(index + 3) % customerIds.length]!;
    const service = services[index % services.length]!;
    const part = parts[index % parts.length]!;

    await prisma.$transaction(async (tx) => {
      const year = entryDate.getFullYear();
      const { formatted: osNumber } = await nextTenantNumber(
        tx,
        ctx.tenantId,
        "service_order",
        year,
        { padding: 5, prefix: `OS${year}` },
      );

      const serviceCents = service.priceCents;
      const partsCents = part.saleCents;
      const totalCents = serviceCents + partsCents;

      const order = await tx.serviceOrder.create({
        data: {
          tenantId: ctx.tenantId,
          number: osNumber,
          customerId,
          technicianId: ctx.adminUserId,
          createdById: ctx.operatorUserId,
          status: plan.status,
          publicLink: `aud2os-${ctx.tenantId.slice(0, 8)}-${osNumber}`,
          deviceType: "Smartphone",
          deviceBrand: pick(["Apple", "Samsung", "Xiaomi", "Motorola"]),
          deviceModel: pick(["iPhone 13", "Galaxy S23", "Redmi Note 13", "Moto G84"]),
          imei: syntheticImei(900 + index),
          reportedProblem: pick([
            "Tela trincada após queda",
            "Não carrega",
            "Desliga sozinho",
            "Molhou e parou de ligar",
            "Bateria dura pouco",
          ]),
          serviceAmount: reais(serviceCents),
          partsAmount: reais(partsCents),
          partsCost: reais(part.costCents),
          totalAmount: reais(totalCents),
          paidAmount: plan.paid ? reais(totalCents) : reais(0),
          entryDate,
          estimatedDate: daysFromNow(-plan.daysAgo + 5),
          completedDate:
            plan.status === "COMPLETED" || plan.status === "DELIVERED"
              ? daysFromNow(-plan.daysAgo + 3)
              : null,
          deliveredDate: plan.status === "DELIVERED" ? daysFromNow(-plan.daysAgo + 4) : null,
          warrantyMonths: 3,
          items: {
            create: [
              {
                tenantId: ctx.tenantId,
                type: "SERVICE",
                serviceId: service.id,
                description: service.name,
                quantity: new Prisma.Decimal(1),
                unitPrice: reais(serviceCents),
                total: reais(serviceCents),
              },
              {
                tenantId: ctx.tenantId,
                type: "PRODUCT",
                productId: part.id,
                description: part.name,
                quantity: new Prisma.Decimal(1),
                unitPrice: reais(partsCents),
                costPrice: reais(part.costCents),
                total: reais(partsCents),
              },
            ],
          },
          history: {
            create: {
              tenantId: ctx.tenantId,
              userId: ctx.operatorUserId,
              previousStatus: null,
              newStatus: plan.status,
              notes: `OS ${osNumber} aberta (seed de auditoria)`,
              createdAt: entryDate,
            },
          },
        },
        select: { id: true },
      });

      if (plan.paid) {
        // OS paga: recebimento à vista em dinheiro, com caixa e ledger — os
        // mesmos três registros que o recebimento pelo PDV escreve.
        const paidAt = daysFromNow(-plan.daysAgo + 4);
        const method = ctx.paymentMethods.get("Dinheiro")!;
        await tx.serviceOrder.update({
          where: { id: order.id },
          data: { paymentMethod: method.token, paymentDate: paidAt },
        });
        const ft = await tx.financialTransaction.create({
          data: {
            tenantId: ctx.tenantId,
            type: "RECEIVABLE",
            status: "PAID",
            description: `OS ${osNumber} - ${method.token}`,
            category: "servico",
            totalAmount: reais(totalCents),
            paidAmount: reais(totalCents),
            installmentsTotal: 1,
            dueDate: paidAt,
            paidAt,
            paymentMethod: method.token,
            paymentMethodId: method.id,
            serviceOrderId: order.id,
            referenceId: order.id,
            referenceType: "SERVICE_ORDER",
            customerId,
            createdByUserId: ctx.operatorUserId,
          },
          select: { id: true },
        });
        await recordCashPaidTransaction(tx, {
          tenantId: ctx.tenantId,
          transactionId: ft.id,
          amountCents: totalCents,
          paidAt,
          paymentMethod: method.token,
          paymentMethodId: method.id,
          createdByUserId: ctx.operatorUserId,
        });
        await writeCashMovement(tx, {
          tenantId: ctx.tenantId,
          cashSessionId: sessions.closedId,
          type: "SALE",
          nature: "INCOME",
          amountCents: totalCents,
          paymentMethod: method.token,
          paymentMethodId: method.id,
          description: `Recebimento OS ${osNumber}`,
          referenceId: order.id,
          referenceType: "SERVICE_ORDER",
          createdByUserId: ctx.operatorUserId,
        });
      }

      // Baixa da peça usada na OS (CAS, nunca negativa).
      const decremented = await tx.product.updateMany({
        where: { id: part.id, currentStock: { gte: 1 } },
        data: { currentStock: { decrement: 1 } },
      });
      if (decremented.count === 1) {
        await tx.stockMovement.create({
          data: {
            tenantId: ctx.tenantId,
            productId: part.id,
            type: "EXIT",
            quantity: 1,
            reason: `OS ${osNumber}`,
            referenceId: order.id,
            referenceType: "service_order",
            userId: ctx.operatorUserId,
            createdAt: entryDate,
          },
        });
      }
    });

    created += 1;
  }

  return created;
}

/**
 * Despesas: uma paga (com ledger) e duas pendentes. Sem PAYABLE o DRE do tenant
 * só teria receita — e um DRE que nunca mostra despesa não valida nada.
 */
async function seedPayables(ctx: SeedContext, supplierIds: string[]): Promise<number> {
  const already = await prisma.financialTransaction.count({
    where: { tenantId: ctx.tenantId, type: "PAYABLE" },
  });
  if (already >= 3) return 0;

  const categories = await prisma.financialCategory.findMany({
    where: { tenantId: ctx.tenantId, type: "DESPESA" },
    select: { id: true, code: true },
  });
  const categoryByCode = new Map(categories.map((c) => [c.code, c.id]));
  const cashMethod = ctx.paymentMethods.get("Dinheiro")!;

  const specs = [
    {
      description: "Aluguel da loja — mês corrente",
      code: "ALUGUEL",
      amountCents: 250_000,
      paid: true,
      daysAgo: 6,
    },
    {
      description: "Compra de acessórios — Distribuidora Nordeste",
      code: "FORNECEDORES",
      amountCents: 187_500,
      paid: false,
      daysAgo: -12,
    },
    {
      description: "Energia elétrica",
      code: "OUTRAS_DESPESAS",
      amountCents: 68_400,
      paid: false,
      daysAgo: -5,
    },
  ] as const;

  let created = 0;
  for (const [index, spec] of specs.entries()) {
    const dueDate = daysFromNow(-spec.daysAgo);
    await prisma.$transaction(async (tx) => {
      const ft = await tx.financialTransaction.create({
        data: {
          tenantId: ctx.tenantId,
          type: "PAYABLE",
          status: spec.paid ? "PAID" : "PENDING",
          description: spec.description,
          categoryId: categoryByCode.get(spec.code) ?? null,
          supplierId: supplierIds[index % supplierIds.length]!,
          totalAmount: reais(spec.amountCents),
          paidAmount: spec.paid ? reais(spec.amountCents) : reais(0),
          installmentsTotal: 1,
          dueDate,
          paidAt: spec.paid ? dueDate : null,
          paymentMethod: spec.paid ? cashMethod.token : null,
          paymentMethodId: spec.paid ? cashMethod.id : null,
          isManual: true,
          createdByUserId: ctx.adminUserId,
        },
        select: { id: true },
      });
      if (spec.paid) {
        await recordCashPaidTransaction(tx, {
          tenantId: ctx.tenantId,
          transactionId: ft.id,
          amountCents: spec.amountCents,
          paidAt: dueDate,
          dueDate,
          paymentMethod: cashMethod.token,
          paymentMethodId: cashMethod.id,
          createdByUserId: ctx.adminUserId,
        });
      } else {
        await tx.installment.create({
          data: {
            tenantId: ctx.tenantId,
            transactionId: ft.id,
            number: 1,
            amount: reais(spec.amountCents),
            dueDate,
            status: "PENDING",
          },
        });
      }
    });
    created += 1;
  }
  return created;
}

/**
 * Fecha a conferência da sessão antiga com o valor REAL da gaveta.
 *
 * Roda depois das vendas de propósito: o `calculatedBalance` tem de bater com os
 * movimentos que existem, e eles só existem agora. Sessão fechada com saldo
 * inventado faria a tela de conferência mentir.
 */
async function reconcileClosedSession(ctx: SeedContext, closedId: string): Promise<void> {
  const session = await prisma.cashSession.findUnique({
    where: { id: closedId },
    select: { initialBalance: true, movements: true },
  });
  if (!session) return;

  const { computeCashDrawerCents } = await import("../../src/server/services/cash-session.service");
  const drawerCents = computeCashDrawerCents(
    Math.round(Number(session.initialBalance) * 100),
    session.movements.map((m) => ({
      nature: m.nature,
      amountCents: Math.round(Number(m.amount) * 100),
      paymentMethod: m.paymentMethod,
    })),
  );
  // Quebra de caixa de R$ 5,00 — divergência pequena e realista, para a tela de
  // conferência ter o que mostrar.
  const declaredCents = drawerCents - 500;

  await prisma.cashSession.update({
    where: { id: closedId },
    data: {
      calculatedBalance: reais(drawerCents),
      declaredBalance: reais(declaredCents),
      difference: reais(declaredCents - drawerCents),
    },
  });
}

/**
 * CPFs sintéticos VÁLIDOS para os clientes. Gerados fora do laço para que a
 * idempotência (busca por `tenant_id + cpf`) tenha uma chave estável.
 */
const SYNTHETIC_CUSTOMER_CPFS = buildCustomerCpfs(CUSTOMER_NAMES.length);

function buildCustomerCpfs(count: number): string[] {
  const out: string[] = [];
  let base = 700_000_000;
  while (out.length < count) {
    const digits = String(base).padStart(9, "0").split("").map(Number);
    const cpf = digits.join("") + checkDigits(digits);
    if (!/^(\d)\1{10}$/.test(cpf)) out.push(cpf);
    base += 137;
  }
  return out;
}

/** Os dois dígitos verificadores do CPF, no algoritmo padrão. */
function checkDigits(base9: number[]): string {
  const digit = (digits: number[]): number => {
    const weightStart = digits.length + 1;
    const sum = digits.reduce((acc, d, i) => acc + d * (weightStart - i), 0);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  const d1 = digit(base9);
  const d2 = digit([...base9, d1]);
  return `${d1}${d2}`;
}

// ── Orquestração ──

async function main(): Promise<void> {
  console.log(`Semeando tenant "${TENANT_SLUG}" no banco local…\n`);

  const ctx = await seedTenantAndUsers();
  const card = await seedAcquirer(ctx);
  const customerIds = await seedCustomers(ctx);
  const supplierIds = await seedSuppliers(ctx);
  const products = await seedProducts(ctx, supplierIds);
  const services = await seedServices(ctx);
  const sessions = await seedCashSessions(ctx);
  const salesCreated = await seedSales(ctx, customerIds, products, sessions, card);
  const ordersCreated = await seedServiceOrders(ctx, customerIds, services, products, sessions);
  const payablesCreated = await seedPayables(ctx, supplierIds);
  await reconcileClosedSession(ctx, sessions.closedId);

  const counts = {
    clientes: await prisma.customer.count({ where: { tenantId: ctx.tenantId, deletedAt: null } }),
    fornecedores: await prisma.supplier.count({ where: { tenantId: ctx.tenantId, deletedAt: null } }),
    produtos: await prisma.product.count({ where: { tenantId: ctx.tenantId, deletedAt: null } }),
    "unidades em estoque": await prisma.stockItem.count({ where: { tenantId: ctx.tenantId } }),
    serviços: await prisma.service.count({ where: { tenantId: ctx.tenantId, deletedAt: null } }),
    vendas: await prisma.sale.count({ where: { tenantId: ctx.tenantId } }),
    "ordens de serviço": await prisma.serviceOrder.count({ where: { tenantId: ctx.tenantId } }),
    "sessões de caixa": await prisma.cashSession.count({ where: { tenantId: ctx.tenantId } }),
    "movimentos de caixa": await prisma.cashMovement.count({ where: { tenantId: ctx.tenantId } }),
    "lançamentos financeiros": await prisma.financialTransaction.count({
      where: { tenantId: ctx.tenantId },
    }),
    parcelas: await prisma.installment.count({ where: { tenantId: ctx.tenantId } }),
    "linhas do ledger": await prisma.installmentPayment.count({ where: { tenantId: ctx.tenantId } }),
    "recebíveis de cartão": await prisma.cardReceivable.count({ where: { tenantId: ctx.tenantId } }),
  };

  console.log(`Tenant: ${TENANT_NAME} (${ctx.tenantId})  slug=${TENANT_SLUG}  plano=${PLAN_SLUG}`);
  console.log(`Criado nesta execução: ${salesCreated} venda(s), ${ordersCreated} OS, ${payablesCreated} despesa(s).\n`);
  for (const [label, value] of Object.entries(counts)) {
    console.log(`  ${label.padEnd(24)} ${value}`);
  }
  console.log("\nCredenciais (login por CPF):");
  for (const spec of USERS) {
    console.log(`  ${spec.role.padEnd(8)} ${spec.cpf}  senha: ${spec.password}  (${spec.name})`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
