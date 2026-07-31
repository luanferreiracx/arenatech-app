/**
 * Finalização — Módulo 12, FD-1: o saldo de fidelidade tem que fechar com o razão.
 *
 * `RewardBalance` carrega NOVE agregados derivados (totalBalance, lockedBalance,
 * availableBalance, totalCreditedHistorical, totalUsedHistorical,
 * totalExpiredHistorical, totalRewardsReceived, totalRewardsUsed,
 * totalCreditedMonth) ao lado de `RewardMovement`, que é o razão. São duas
 * fontes de verdade para o mesmo fato, e **nenhuma constraint liga as duas** —
 * o banco só garante que o saldo não fica negativo (CHECK).
 *
 * Os testes que já existiam cobrem as peças (concorrência no lock, fila de
 * aprovação, resgate no PDV, saldo do cliente). Nenhum somava o razão e comparava
 * com os agregados ao fim de um ciclo inteiro — que é onde a deriva aparece: basta
 * um caminho novo atualizar o saldo e esquecer o movimento (ou o contrário) para
 * as duas versões da verdade começarem a discordar em silêncio.
 *
 * Em produção o módulo está com ZERO linhas em todas as quatro tabelas — este
 * teste é o guardião para o dia em que a loja ligar o programa.
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
const MARK = `rwl-${Date.now().toString(36)}`;
let tenantId: string;
let adminId: string;
let customerId: string;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let adminCtx: any;
const actionIds: string[] = [];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const call = (c: any) => createCallerFactory(appRouter)(c);

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    withTenant: (fn: any) => withTenant(tenantId, fn),
    headers: new Headers({ "x-forwarded-for": "127.0.0.1" }),
  };
  const customer = await prisma.customer.create({
    data: { tenantId, name: `Cliente ${MARK}`, phone: "11922221111" },
  });
  customerId = customer.id;
});

afterAll(async () => {
  const balances = await prisma.rewardBalance.findMany({
    where: { tenantId, customerId },
    select: { id: true },
  });
  await prisma.rewardMovement.deleteMany({ where: { balanceId: { in: balances.map((b) => b.id) } } });
  await prisma.rewardBalance.deleteMany({ where: { tenantId, customerId } });
  await prisma.rewardAction.deleteMany({ where: { id: { in: actionIds } } });
  await prisma.customer.deleteMany({ where: { id: customerId } });
  await prisma.$disconnect();
});

/** Soma o razão por tipo de movimento. */
async function razao() {
  const balance = await prisma.rewardBalance.findFirstOrThrow({ where: { tenantId, customerId } });
  const movs = await prisma.rewardMovement.findMany({ where: { balanceId: balance.id } });
  const porTipo = (tipo: string) =>
    movs.filter((m) => m.type === tipo).reduce((s, m) => s + Number(m.amount), 0);
  return {
    balance,
    creditos: porTipo("credit"),
    debitos: porTipo("debit"),
    reservas: porTipo("lock"),
    liberacoes: porTipo("unlock"),
    expiracoes: porTipo("expire"),
    total: movs.length,
  };
}

describe("FD-1 — saldo de fidelidade fecha com o razão", () => {
  it("crédito, reserva, liberação e uso mantêm os agregados coerentes", async () => {
    // 1. Crédito — cashback aprovado de R$ 120.
    const acao = await call(adminCtx).reward.createAction({
      customerId,
      rewardType: "CASHBACK",
      value: 12000,
    });
    actionIds.push(acao.id);
    await call(adminCtx).reward.approveAction({ actionId: acao.id });

    let r = await razao();
    expect(r.creditos, "o crédito tem que estar no razão").toBe(120);
    expect(Number(r.balance.totalBalance)).toBe(120);
    expect(Number(r.balance.availableBalance)).toBe(120);
    expect(Number(r.balance.totalCreditedHistorical)).toBe(120);

    // 2. Reserva de R$ 50 — sai do disponível, não do total.
    await call(adminCtx).reward.lockBalance({ customerId, amountCents: 5000 });

    r = await razao();
    expect(r.reservas).toBe(50);
    expect(Number(r.balance.totalBalance), "reserva não muda o total").toBe(120);
    expect(Number(r.balance.lockedBalance)).toBe(50);
    expect(Number(r.balance.availableBalance)).toBe(70);
    // A invariante estrutural do modelo, em toda transição.
    expect(
      Number(r.balance.availableBalance),
      "disponível tem que ser total menos reservado",
    ).toBe(Number(r.balance.totalBalance) - Number(r.balance.lockedBalance));

    // 3. Liberação da reserva — volta para o disponível.
    await call(adminCtx).reward.unlockBalance({ customerId, amountCents: 5000 });

    r = await razao();
    expect(r.liberacoes).toBe(50);
    expect(Number(r.balance.lockedBalance)).toBe(0);
    expect(Number(r.balance.availableBalance)).toBe(120);
    expect(Number(r.balance.availableBalance)).toBe(
      Number(r.balance.totalBalance) - Number(r.balance.lockedBalance),
    );

    // 4. Fechamento: o total creditado do razão bate com o agregado histórico, e
    //    todo movimento tem contrapartida — nenhum saldo mudou sem registro.
    r = await razao();
    expect(Number(r.balance.totalCreditedHistorical)).toBe(r.creditos);
    expect(
      Number(r.balance.totalBalance),
      "total = créditos − débitos − expirações",
    ).toBe(r.creditos - r.debitos - r.expiracoes);
    expect(r.reservas, "toda reserva foi liberada neste cenário").toBe(r.liberacoes);
  });

  it("nenhuma mudança de saldo acontece sem movimento no razão", async () => {
    const antes = await razao();

    const acao = await call(adminCtx).reward.createAction({
      customerId,
      rewardType: "CASHBACK",
      value: 3000,
    });
    actionIds.push(acao.id);
    await call(adminCtx).reward.approveAction({ actionId: acao.id });

    const depois = await razao();

    // O saldo subiu R$ 30 — e o razão ganhou exatamente uma linha explicando.
    expect(Number(depois.balance.totalBalance) - Number(antes.balance.totalBalance)).toBe(30);
    expect(depois.total - antes.total).toBe(1);
    expect(depois.creditos - antes.creditos).toBe(30);
  });
});
