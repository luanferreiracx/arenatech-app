/**
 * closeApuracao — atomicidade transacional (regressão do R3 da auditoria backend
 * 2026-07-08). Roda contra o Postgres local (docker-compose :5432).
 *
 * Exercita a MESMA cadeia transacional do resolver `closeApuracao` — withTenant +
 * createProviderApuracaoPayable + UPDATE OPEN→CLOSED — diretamente contra o banco,
 * sem montar o caller tRPC (que arrasta a árvore do NextAuth, inviável em node —
 * é por isso que rls.test.ts também exercita withTenant direto).
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
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { withTenant } from "@/server/db";
import { createProviderApuracaoPayable } from "@/server/services/provider-apuracao-payable.service";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

let tenantId: string;
let userId: string;
let providerId: string;

const YEAR = 2099; // fora de qualquer dado semeado — isola o teste
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
});

afterAll(async () => {
  await prisma.installment.deleteMany({ where: { tenantId } });
  await prisma.financialTransaction.deleteMany({ where: { tenantId } });
  await prisma.providerReversal.deleteMany({ where: { tenantId } });
  await prisma.providerApuracao.deleteMany({ where: { tenantId } });
  await prisma.provider.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { slug: "close-apu-test" } });
  await prisma.user.deleteMany({ where: { cpf: "00000000191" } });
  await prisma.$disconnect();
});

describe("closeApuracao — atomicidade", () => {
  it("1. caminho feliz: fecha e gera PAYABLE + Installment atomicamente", async () => {
    await createOpenApuracao(250);

    const res = await closeApuracaoTx();
    expect(res.financialTransactionId).toBeTruthy();

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

    await closeApuracaoTx();
    await expect(closeApuracaoTx()).rejects.toThrow(/ja fechada/i);
    expect(await prisma.financialTransaction.count({ where: { tenantId } })).toBe(1);

    await prisma.installment.deleteMany({ where: { tenantId } });
    await prisma.financialTransaction.deleteMany({ where: { tenantId } });
    await prisma.providerApuracao.deleteMany({ where: { tenantId } });
  });
});
