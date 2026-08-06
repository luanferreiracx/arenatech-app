/**
 * closeApuracao — atomicidade transacional (regressão do R3 da auditoria backend
 * 2026-07-08). Roda contra o Postgres local (docker-compose :5432).
 *
 * Chama o RESOLVER de verdade (`providerCommission.closeApuracao`), não uma
 * réplica da cadeia.
 *
 * Etapa 7, Módulo 2 (achado E): este arquivo era uma cópia manual do resolver,
 * declarada como "1:1" — e a cópia **omitia a chamada a `recomputeProviderApuracao`**.
 * Ou seja: o único teste que dava confiança no fechamento exercitava a versão
 * ANTERIOR ao fix C2 (recomputar antes de fechar, para o PAYABLE não sair com
 * valor stale). Se o recompute quebrasse, este teste passava verde.
 *
 * A justificativa original ("o caller tRPC arrasta a árvore do NextAuth, inviável
 * em node") estava desatualizada: o arquivo vizinho
 * `commission-close-recalc-settle.test.ts` monta o caller normalmente com
 * `vi.mock("@/server/auth")`. É o mesmo padrão usado aqui agora.
 *
 * A propriedade sob teste é a do FIX: o fechamento é ATÔMICO. Se o PAYABLE falhar
 * no meio, TUDO é desfeito — a apuração continua OPEN e não sobra transação
 * financeira órfã. Antes do fix, um estado intermediário CLOSING + rollback manual
 * numa transação já abortada deixava a apuração presa em CLOSING para sempre.
 *
 * Cobre:
 *   1. caminho feliz — fecha, gera PAYABLE + Installment atomicamente;
 *   2. ROLLBACK — PAYABLE falha ⇒ status permanece OPEN, sem PAYABLE órfão;
 *   3. duplo-fechamento — o CAS updateMany(status:OPEN) barra o 2º fechamento.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
vi.mock("@/server/auth", () => ({ auth: async () => null }));
import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { withTenant } from "@/server/db";
import { createProviderApuracaoPayable } from "@/server/services/provider-apuracao-payable.service";
import { createCallerFactory } from "@/server/api/trpc";
import { appRouter } from "@/server/api/root";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

let tenantId: string;
let userId: string;
let providerId: string;
let contractId: string | undefined;

const YEAR = 2099; // fora de qualquer dado semeado — isola o teste

/** Caller admin do tenant de teste — `closeApuracao` é `tenantAdminProcedure`. */
function caller() {
  return createCallerFactory(appRouter)({
    session: {
      user: { id: userId, isSuperAdmin: false },
      activeTenantId: tenantId,
      availableTenants: [
        { id: tenantId, slug: "close-apu-test", role: "admin", modules: ["commissions", "financial"] },
      ],
    },
    tenantId,
    withTenant: (fn: never) => withTenant(tenantId, fn),
  } as never);
}
const MONTH = 6;

/**
 * Réplica fiel da cadeia transacional do resolver closeApuracao (provider-commission.ts):
 * numa transação só, cria o PAYABLE (se net>0) e faz o CAS OPEN→CLOSED. `failPayable`
 * injeta uma falha no meio para exercitar o rollback. Mantém 1:1 com o resolver — se o
 * resolver mudar de forma, este teste deve mudar junto.
 */
async function closeApuracaoTx(opts: { failPayable?: boolean } = {}) {
  return withTenant(tenantId, async (tx) => {
    const apuracao = await tx.providerApuracao.findFirst({
      where: { providerId, year: YEAR, month: MONTH },
    });
    if (!apuracao) throw new Error("apuracao não encontrada");
    if (apuracao.status !== "OPEN") throw new Error("Apuracao ja fechada");

    const netAmount = Number(apuracao.netAmount);
    let financialTransactionId: string | null = null;
    if (netAmount > 0) {
      if (opts.failPayable) throw new Error("boom: PAYABLE falhou de propósito");
      financialTransactionId = await createProviderApuracaoPayable(tx, tenantId, {
        apuracaoId: apuracao.id,
        providerName: "Prestador Teste",
        netAmount: apuracao.netAmount as Prisma.Decimal,
        year: YEAR,
        month: MONTH,
        createdByUserId: userId,
      });
    }

    // CAS: fecha só se ainda OPEN. Numa 2ª chamada concorrente, count=0 ⇒ aborta.
    const reservation = await tx.providerApuracao.updateMany({
      where: { id: apuracao.id, status: "OPEN" },
      data: { status: "CLOSED", closedAt: new Date(), closedById: userId, financialTransactionId },
    });
    if (reservation.count === 0) throw new Error("CONFLICT: fechada por outro processo");

    return { financialTransactionId };
  });
}

/**
 * Contrato vigente com ajuda de custo — é ELE que dá valor à apuração quando o
 * resolver real roda o recompute.
 *
 * Sem contrato, `recomputeProviderApuracao` zera tudo e grava o aviso "Sem
 * contrato vigente" (comportamento correto, CM-4). A réplica antiga não chamava
 * o recompute, então passava com uma apuração criada à mão — e escondia
 * exatamente esta dependência.
 *
 * A ajuda de custo (e não vendas) porque é determinística: não depende de
 * semear vendas, itens e regras de balde só para o fechamento ter valor.
 */
async function createContrato(valorMensal: number) {
  return prisma.providerContract.upsert({
    where: { id: contractId ?? "00000000-0000-0000-0000-000000000000" },
    update: {},
    create: {
      tenantId,
      providerId,
      version: 1,
      startDate: new Date(Date.UTC(YEAR - 1, 0, 1)),
      monthlyCellphone: valorMensal,
    },
  });
}

async function createOpenApuracao(net: number) {
  return prisma.providerApuracao.create({
    data: {
      tenantId,
      providerId,
      year: YEAR,
      month: MONTH,
      status: "OPEN",
      netAmount: net,
      grossCommission: net,
      memoryJson: { linhas: [], total_comissao: net },
    },
  });
}

beforeAll(async () => {
  const tenant = await prisma.tenant.upsert({
    where: { slug: "close-apu-test" },
    update: {},
    create: { slug: "close-apu-test", name: "Close Apuracao Test", status: "ACTIVE" },
  });
  tenantId = tenant.id;

  // cpf não é @unique no schema Prisma (índice parcial via SQL, ADR 0050) — busca-e-cria.
  const existingUser = await prisma.user.findFirst({ where: { cpf: "00000000191" } });
  const user =
    existingUser ??
    (await prisma.user.create({
      data: { cpf: "00000000191", name: "Prestador Teste", passwordHash: "x" },
    }));
  userId = user.id;

  const provider = await prisma.provider.upsert({
    where: { tenantId_userId: { tenantId, userId } },
    update: {},
    create: { tenantId, userId, profile: "SELLER", bondType: "MEI" },
  });
  providerId = provider.id;

  const contrato = await prisma.providerContract.create({
    data: {
      tenantId,
      providerId,
      version: 1,
      startDate: new Date(Date.UTC(YEAR - 1, 0, 1)),
      monthlyCellphone: 250,
      // O recompute exige contrato COM regra: `!contract || contract.rules.length === 0`
      // cai no caminho "sem contrato vigente" e zera tudo (CM-4). Uma regra basta —
      // o valor da apuração vem da ajuda de custo, que é determinística.
      rules: {
        create: [
          {
            tenantId,
            category: "produto_acessorio",
            scope: "normal",
            valueType: "PERCENT",
            base: "PROFIT",
            source: "OWN",
            rangeMin: 0,
            rate: 10,
          },
        ],
      },
    },
  });
  contractId = contrato.id;
});

afterAll(async () => {
  await prisma.installment.deleteMany({ where: { tenantId } });
  await prisma.financialTransaction.deleteMany({ where: { tenantId } });
  await prisma.providerReversal.deleteMany({ where: { tenantId } });
  await prisma.providerApuracao.deleteMany({ where: { tenantId } });
  await prisma.providerContract.deleteMany({ where: { tenantId } });
  await prisma.provider.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { slug: "close-apu-test" } });
  await prisma.user.deleteMany({ where: { cpf: "00000000191" } });
  await prisma.$disconnect();
});

describe("closeApuracao — atomicidade", () => {
  it("1. caminho feliz: fecha e gera PAYABLE + Installment atomicamente", async () => {
    await createOpenApuracao(250);

    // Corrompe o valor gravado ANTES de fechar. Se o resolver recomputar (fix
    // C2), o PAYABLE sai com o valor recalculado (250, da ajuda de custo) e não
    // com o lixo. A réplica antiga lia `apuracao.netAmount` direto e passaria
    // com 99999 — era exatamente esse o buraco do achado E.
    await prisma.providerApuracao.updateMany({
      where: { tenantId, providerId, year: YEAR, month: MONTH },
      data: { netAmount: new Prisma.Decimal(99999) },
    });

    // Resolver REAL: passa pelo recompute, pelo PAYABLE e pelo CAS.
    const res = await caller().providerCommission.closeApuracao({ providerId, year: YEAR, month: MONTH });
    expect(res.financialTransactionId).toBeTruthy();

    const payable = await prisma.financialTransaction.findFirstOrThrow({
      where: { id: res.financialTransactionId! },
    });
    expect(
      Number(payable.totalAmount),
      "o PAYABLE saiu com o valor STALE — o recompute não rodou (regressão do fix C2)",
    ).toBe(250);

    const apu = await prisma.providerApuracao.findFirstOrThrow({
      where: { tenantId, providerId, year: YEAR, month: MONTH },
    });
    expect(apu.status).toBe("CLOSED");
    expect(apu.financialTransactionId).toBe(res.financialTransactionId);
    expect(await prisma.financialTransaction.count({ where: { tenantId } })).toBe(1);
    expect(await prisma.installment.count({ where: { tenantId } })).toBe(1);

    await prisma.installment.deleteMany({ where: { tenantId } });
    await prisma.financialTransaction.deleteMany({ where: { tenantId } });
    await prisma.providerApuracao.deleteMany({ where: { tenantId } });
  });

  /**
   * Único caso que ainda usa a réplica: para exercitar o rollback é preciso
   * INJETAR uma falha no meio da transação, e o resolver real não tem esse
   * gancho. A réplica cobre só o trecho PAYABLE→CAS, que é o que o R3 afirma.
   */
  it("2. rollback: se o PAYABLE falha, a apuração continua OPEN e não sobra órfão", async () => {
    await createOpenApuracao(250);

    await expect(closeApuracaoTx({ failPayable: true })).rejects.toThrow(/boom/);

    // A prova do R3: nada de estado preso. Status OPEN, zero PAYABLE, zero parcela.
    const apu = await prisma.providerApuracao.findFirstOrThrow({
      where: { tenantId, providerId, year: YEAR, month: MONTH },
    });
    expect(apu.status).toBe("OPEN");
    expect(apu.financialTransactionId).toBeNull();
    expect(await prisma.financialTransaction.count({ where: { tenantId } })).toBe(0);
    expect(await prisma.installment.count({ where: { tenantId } })).toBe(0);

    await prisma.providerApuracao.deleteMany({ where: { tenantId } });
  });

  it("3. duplo-fechamento: o CAS barra o 2º fechamento, sem 2º PAYABLE", async () => {
    await createOpenApuracao(100);

    await caller().providerCommission.closeApuracao({ providerId, year: YEAR, month: MONTH });
    await expect(
      caller().providerCommission.closeApuracao({ providerId, year: YEAR, month: MONTH }),
    ).rejects.toThrow(/fechada|CONFLICT/i);
    expect(await prisma.financialTransaction.count({ where: { tenantId } })).toBe(1);

    await prisma.installment.deleteMany({ where: { tenantId } });
    await prisma.financialTransaction.deleteMany({ where: { tenantId } });
    await prisma.providerApuracao.deleteMany({ where: { tenantId } });
  });
});
