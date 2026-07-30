/**
 * Finalização — Módulo 8: `recomputeProviderApuracao` contra o Postgres local.
 *
 * Esta função é o motor de dinheiro do módulo: é ela que `calculate` chama e,
 * mais importante, é ela que `closeApuracao` chama **sob o lock**, logo antes de
 * gerar o PAYABLE. O que ela grava vira pagamento.
 *
 * Antes desta passada ela vivia privada dentro do router e não tinha teste
 * próprio: o núcleo puro (faixas, baldes, ajuda de custo) era bem coberto, a
 * fiação não era. Os dois defeitos abaixo estavam exatamente na fiação.
 *
 * CM-1 — os dias do mês do rateio da ajuda de custo vinham de
 *   `periodEnd.getDate()`, que lê no fuso do PROCESSO. Em produção (container
 *   UTC, confirmado) isso devolvia **1**. Sem dia descoberto a proporção dava
 *   1/1 e o valor saía certo por acidente; com UM dia descoberto o prestador
 *   perdia a ajuda de custo do mês inteiro.
 *
 * CM-4 — o ramo "sem contrato vigente" fazia `update: {}`: recalcular um período
 *   que perdeu a cobertura do contrato PRESERVAVA os valores antigos. Como o
 *   fechamento recomputa e sela o resultado num PAYABLE, uma apuração antiga
 *   viraria pagamento sem contrato que a sustentasse.
 *
 * O fuso é forçado para UTC no arquivo inteiro: é o fuso da VPS, e é o único
 * lugar onde o CM-1 se manifesta.
 */
process.env.TZ = "UTC";

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { withTenant } from "@/server/db";
import { recomputeProviderApuracao } from "@/server/services/commission-preview.service";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

let tenantId: string;
let userId: string;
let providerId: string;
let contractId: string;

const YEAR = 2098; // fora de qualquer dado semeado — isola o teste
const MONTH = 7; // julho: 31 dias
const AJUDA_MENSAL = 1000; // espelha o contrato real de producao

beforeAll(async () => {
  const tenant = await prisma.tenant.upsert({
    where: { slug: "recompute-test" },
    update: {},
    create: { slug: "recompute-test", name: "Recompute Test", status: "ACTIVE" },
  });
  tenantId = tenant.id;

  // cpf nao e @unique no schema Prisma (indice parcial via SQL, ADR 0050).
  const existente = await prisma.user.findFirst({ where: { cpf: "00000000272" } });
  const user =
    existente ??
    (await prisma.user.create({
      data: { cpf: "00000000272", name: "Prestador Recompute", passwordHash: "x" },
    }));
  userId = user.id;

  const provider = await prisma.provider.upsert({
    where: { tenantId_userId: { tenantId, userId } },
    update: {},
    create: { tenantId, userId, profile: "SELLER", bondType: "MEI" },
  });
  providerId = provider.id;

  const contract = await prisma.providerContract.create({
    data: {
      tenantId,
      providerId,
      startDate: new Date(Date.UTC(YEAR, 0, 1)),
      endDate: null,
      dailyMeal: new Prisma.Decimal(AJUDA_MENSAL),
      allowanceCap: null,
    },
  });
  contractId = contract.id;

  // Uma regra qualquer: sem regras o motor cai no ramo "sem contrato vigente".
  await prisma.providerCommissionRule.create({
    data: {
      tenantId,
      contractId,
      category: "produto_aparelho",
      scope: "normal",
      source: "OWN",
      valueType: "PERCENT",
      base: "PROFIT",
      rangeMin: new Prisma.Decimal(0),
      rangeMax: null,
      rate: new Prisma.Decimal(5),
    },
  });
});

afterAll(async () => {
  await prisma.providerUncoveredDay.deleteMany({ where: { tenantId } });
  await prisma.providerApuracao.deleteMany({ where: { tenantId } });
  await prisma.providerCommissionRule.deleteMany({ where: { tenantId } });
  await prisma.providerContract.deleteMany({ where: { tenantId } });
  await prisma.provider.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.$disconnect();
});

async function recomputar() {
  return withTenant(tenantId, (tx) =>
    recomputeProviderApuracao(tx, tenantId, providerId, YEAR, MONTH),
  );
}

async function apuracaoAtual() {
  return prisma.providerApuracao.findFirstOrThrow({
    where: { providerId, year: YEAR, month: MONTH },
  });
}

describe("CM-1 — ajuda de custo proporcional aos dias, em UTC", () => {
  it("sem dia descoberto paga a ajuda integral", async () => {
    await prisma.providerUncoveredDay.deleteMany({ where: { providerId } });
    await recomputar();
    expect(Number((await apuracaoAtual()).totalAllowance)).toBe(AJUDA_MENSAL);
  });

  it("um dia descoberto desconta UM dia, nao o mes inteiro", async () => {
    await prisma.providerUncoveredDay.create({
      data: { tenantId, providerId, day: new Date(Date.UTC(YEAR, MONTH - 1, 10)), reason: "teste" },
    });
    await recomputar();

    // 30 de 31 dias de R$ 1.000 = R$ 967,74. Com o bug dava R$ 0,00 — o
    // prestador perdia a ajuda inteira por faltar um dia.
    expect(Number((await apuracaoAtual()).totalAllowance)).toBeCloseTo(967.74, 2);
  });

  it("o mes inteiro descoberto zera a ajuda", async () => {
    await prisma.providerUncoveredDay.deleteMany({ where: { providerId } });
    await prisma.providerUncoveredDay.createMany({
      data: Array.from({ length: 31 }, (_, i) => ({
        tenantId,
        providerId,
        day: new Date(Date.UTC(YEAR, MONTH - 1, i + 1)),
        reason: "teste",
      })),
    });
    await recomputar();
    expect(Number((await apuracaoAtual()).totalAllowance)).toBe(0);
  });
});

describe("CM-3 — o corte do teto fica registrado", () => {
  it("grava capReduction quando o teto corta a ajuda", async () => {
    await prisma.providerUncoveredDay.deleteMany({ where: { providerId } });
    await prisma.providerContract.update({
      where: { id: contractId },
      data: { allowanceCap: new Prisma.Decimal(600) },
    });
    await recomputar();

    const apuracao = await apuracaoAtual();
    expect(Number(apuracao.totalAllowance)).toBe(600);
    // Antes o campo existia, era exibido na ficha e ninguem o escrevia: a tela
    // dizia "R$ 0,00 de reducao" enquanto o teto cortava R$ 400.
    expect(Number(apuracao.capReduction)).toBe(400);

    await prisma.providerContract.update({
      where: { id: contractId },
      data: { allowanceCap: null },
    });
  });
});

describe("CM-4 — recalcular sem contrato vigente zera, nao preserva", () => {
  it("periodo que perdeu a cobertura do contrato volta a zero", async () => {
    await prisma.providerUncoveredDay.deleteMany({ where: { providerId } });
    await recomputar();
    expect(Number((await apuracaoAtual()).netAmount)).toBeGreaterThan(0);

    // Admin edita a vigencia do contrato para depois do periodo apurado.
    await prisma.providerContract.update({
      where: { id: contractId },
      data: { startDate: new Date(Date.UTC(YEAR + 1, 0, 1)) },
    });
    await recomputar();

    const apuracao = await apuracaoAtual();
    // Antes: `update: {}` mantinha os R$ 1.000 — e `closeApuracao` recomputa e
    // SELA o resultado num PAYABLE, entao isso viraria pagamento real.
    expect(Number(apuracao.netAmount)).toBe(0);
    expect(Number(apuracao.totalAllowance)).toBe(0);
    expect(Number(apuracao.grossCommission)).toBe(0);
    expect((apuracao.memoryJson as { aviso?: string })?.aviso).toBe("Sem contrato vigente");

    await prisma.providerContract.update({
      where: { id: contractId },
      data: { startDate: new Date(Date.UTC(YEAR, 0, 1)) },
    });
  });
});
