/**
 * updateRules — reconciliacao autoritativa das aliquotas de comissao.
 * Roda contra o Postgres local (docker-compose :5432).
 *
 * Regressao: apos editar as aliquotas, ao reabrir o editor de contrato as faixas
 * que o usuario removeu (botao lixeira) ou zerou (rate = 0, filtradas na UI por
 * rate > 0) reapareciam com os valores antigos. Causa: o resolver so criava/
 * atualizava/apagava as regras PRESENTES no payload — nunca removia as regras
 * existentes ausentes dele. O fix torna o payload a lista COMPLETA desejada:
 * qualquer regra existente fora dele e apagada.
 *
 * Exercita a MESMA cadeia do resolver `updateRules` (provider-commission.ts)
 * direto contra o banco via withTenant — sem montar o caller tRPC (que arrasta a
 * arvore do NextAuth, inviavel em node), no mesmo padrao de close-apuracao.test.ts.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { withTenant } from "@/server/db";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

let tenantId: string;
let userId: string;
let providerId: string;
let contractId: string;

type RulePayload = {
  id?: string | null;
  category: string;
  scope: string;
  valueType: string;
  base: string;
  source: string;
  rangeMin: number;
  rangeMax: number | null;
  rate: number;
  _delete?: boolean;
};

/**
 * Replica fiel da reconciliacao do resolver updateRules: o payload e a lista
 * completa desejada. Regras existentes ausentes dele sao apagadas; as demais sao
 * atualizadas (com id) ou criadas (sem id, so se rate > 0). Mantem 1:1 com o
 * resolver — se o resolver mudar, este teste muda junto.
 */
async function updateRulesTx(rules: RulePayload[]) {
  return withTenant(tenantId, async (tx) => {
    const existing = await tx.providerCommissionRule.findMany({
      where: { contractId },
      select: { id: true },
    });
    const keepIds = new Set(
      rules.filter((rule) => !rule._delete && rule.id != null).map((rule) => rule.id as string),
    );
    const idsToDelete = existing.filter((rule) => !keepIds.has(rule.id)).map((rule) => rule.id);
    if (idsToDelete.length > 0) {
      await tx.providerCommissionRule.deleteMany({ where: { id: { in: idsToDelete } } });
    }

    for (const rule of rules) {
      if (rule._delete) continue;
      const payload = {
        tenantId,
        contractId,
        category: rule.category,
        scope: rule.scope,
        valueType: rule.valueType,
        base: rule.base,
        source: rule.source,
        rangeMin: new Prisma.Decimal(rule.rangeMin),
        rangeMax: rule.rangeMax != null ? new Prisma.Decimal(rule.rangeMax) : null,
        rate: new Prisma.Decimal(rule.rate),
      };
      if (rule.id) {
        await tx.providerCommissionRule.update({ where: { id: rule.id }, data: payload });
      } else if (rule.rate > 0) {
        await tx.providerCommissionRule.create({ data: payload });
      }
    }
  });
}

function rule(overrides: Partial<RulePayload> = {}): RulePayload {
  return {
    category: "device",
    scope: "normal",
    valueType: "PERCENT",
    base: "PROFIT",
    source: "OWN",
    rangeMin: 0,
    rangeMax: null,
    rate: 5,
    ...overrides,
  };
}

async function listRules() {
  return prisma.providerCommissionRule.findMany({
    where: { contractId },
    orderBy: { rangeMin: "asc" },
  });
}

beforeAll(async () => {
  const tenant = await prisma.tenant.upsert({
    where: { slug: "update-rules-test" },
    update: {},
    create: { slug: "update-rules-test", name: "Update Rules Test", status: "ACTIVE" },
  });
  tenantId = tenant.id;

  const existingUser = await prisma.user.findFirst({ where: { cpf: "00000000272" } });
  const user =
    existingUser ??
    (await prisma.user.create({
      data: { cpf: "00000000272", name: "Prestador Regras", passwordHash: "x" },
    }));
  userId = user.id;

  const provider = await prisma.provider.upsert({
    where: { tenantId_userId: { tenantId, userId } },
    update: {},
    create: { tenantId, userId, profile: "SELLER", bondType: "MEI" },
  });
  providerId = provider.id;

  const contract = await prisma.providerContract.create({
    data: { tenantId, providerId, startDate: new Date("2099-01-01") },
  });
  contractId = contract.id;
});

beforeEach(async () => {
  await prisma.providerCommissionRule.deleteMany({ where: { contractId } });
});

afterAll(async () => {
  await prisma.providerCommissionRule.deleteMany({ where: { contractId } });
  await prisma.providerContract.deleteMany({ where: { tenantId } });
  await prisma.provider.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { slug: "update-rules-test" } });
  await prisma.user.deleteMany({ where: { cpf: "00000000272" } });
  await prisma.$disconnect();
});

describe("updateRules — reconciliacao autoritativa", () => {
  it("cria as faixas novas do payload", async () => {
    await updateRulesTx([
      rule({ rangeMin: 0, rangeMax: 1000, rate: 5 }),
      rule({ rangeMin: 1000, rangeMax: null, rate: 8 }),
    ]);

    const rules = await listRules();
    expect(rules).toHaveLength(2);
    expect(rules.map((r) => Number(r.rate))).toEqual([5, 8]);
  });

  it("faixa REMOVIDA (ausente do payload) e apagada, nao reaparece", async () => {
    await updateRulesTx([
      rule({ rangeMin: 0, rangeMax: 1000, rate: 5 }),
      rule({ rangeMin: 1000, rangeMax: null, rate: 8 }),
    ]);
    const [first] = await listRules();

    // UI remove a 2a faixa: reenvia so a 1a (com seu id), a 2a some do payload.
    await updateRulesTx([
      rule({ id: first!.id, rangeMin: 0, rangeMax: 1000, rate: 5 }),
    ]);

    const rules = await listRules();
    expect(rules).toHaveLength(1);
    expect(rules[0]!.id).toBe(first!.id);
  });

  it("faixa ZERADA (rate 0, filtrada pela UI) e apagada, nao reaparece", async () => {
    await updateRulesTx([rule({ rangeMin: 0, rangeMax: null, rate: 7 })]);
    expect(await listRules()).toHaveLength(1);

    // UI zera a aliquota → filtra por rate > 0 → payload vazio.
    await updateRulesTx([]);

    expect(await listRules()).toHaveLength(0);
  });

  it("atualiza a faixa existente e preserva o id", async () => {
    await updateRulesTx([rule({ rangeMin: 0, rangeMax: null, rate: 5 })]);
    const [existing] = await listRules();

    await updateRulesTx([rule({ id: existing!.id, rangeMin: 0, rangeMax: null, rate: 9 })]);

    const rules = await listRules();
    expect(rules).toHaveLength(1);
    expect(rules[0]!.id).toBe(existing!.id);
    expect(Number(rules[0]!.rate)).toBe(9);
  });
});
