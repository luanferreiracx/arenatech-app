/**
 * Auditoria 2026-07-25 — saldo de cashback podia ficar NEGATIVO.
 *
 * `lockBalance`/`unlockBalance` faziam read-modify-write sem CAS: o gate
 * ("disponível >= pedido") era avaliado sobre um snapshot e o `decrement`
 * seguinte — atômico no SQL, mas sem reavaliar a condição — aplicava mesmo
 * assim. Dois locks concorrentes de R$100 sobre um saldo de R$100 passavam os
 * dois e deixavam `availableBalance = -100`.
 *
 * Duas camadas: CAS repetindo a condição no `where` (o Postgres reavalia após o
 * row lock, então o perdedor vê count 0) + CHECK no banco como rede final para
 * qualquer caminho novo que esqueça o guard.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
vi.mock("@/server/auth", () => ({ auth: async () => null }));
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createCallerFactory } from "@/server/api/trpc";
import { appRouter } from "@/server/api/root";
import { withTenant } from "@/server/db";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const MARK = "reward-non-negative";
let tenantId: string, adminId: string, customerId: string, ctx: any;

const caller = () => createCallerFactory(appRouter)(ctx);

beforeAll(async () => {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "arena-tech" } });
  const admin = await prisma.user.findFirstOrThrow({ where: { name: "Admin Arena" } });
  tenantId = tenant.id;
  adminId = admin.id;
  ctx = {
    session: {
      user: { id: adminId, isSuperAdmin: false },
      activeTenantId: tenantId,
      availableTenants: [{ id: tenantId, slug: "arena-tech", role: "admin", modules: ["customers"] }],
    },
    tenantId,
    withTenant: (fn: any) => withTenant(tenantId, fn),
  };
  customerId = (await prisma.customer.create({
    data: { tenantId, name: `${MARK}-cliente`, phone: "11933332222" },
  })).id;
});

afterAll(async () => {
  const b = await prisma.rewardBalance.findFirst({ where: { tenantId, customerId } });
  if (b) await prisma.rewardMovement.deleteMany({ where: { balanceId: b.id } });
  await prisma.rewardBalance.deleteMany({ where: { tenantId, customerId } });
  await prisma.customer.deleteMany({ where: { id: customerId } });
  await prisma.$disconnect();
});

/** Zera o saldo do cliente com R$100 disponíveis e nada reservado. */
beforeEach(async () => {
  const existing = await prisma.rewardBalance.findFirst({ where: { tenantId, customerId } });
  if (existing) await prisma.rewardMovement.deleteMany({ where: { balanceId: existing.id } });
  await prisma.rewardBalance.deleteMany({ where: { tenantId, customerId } });
  await prisma.rewardBalance.create({
    data: { tenantId, customerId, totalBalance: 100, availableBalance: 100, lockedBalance: 0 },
  });
});

async function saldo() {
  const b = await prisma.rewardBalance.findFirstOrThrow({ where: { tenantId, customerId } });
  return { disponivel: Number(b.availableBalance), reservado: Number(b.lockedBalance) };
}

describe("saldo de cashback nunca fica negativo", () => {
  /** Erro do perdedor da corrida, em texto. */
  const motivo = (r: PromiseSettledResult<unknown>[]) =>
    r.filter((x): x is PromiseRejectedResult => x.status === "rejected").map((x) => String(x.reason));

  it("dois lockBalance SIMULTÂNEOS de R$100 sobre R$100: só um vale", async () => {
    const r = await Promise.allSettled([
      caller().reward.lockBalance({ customerId, amountCents: 10000 }),
      caller().reward.lockBalance({ customerId, amountCents: 10000 }),
    ]);

    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(await saldo()).toEqual({ disponivel: 0, reservado: 100 });

    // O perdedor tem que cair numa mensagem de NEGÓCIO — e NÃO na CHECK do
    // banco (que existe como rede final, mas vaza "violates check constraint"
    // pro usuário). É isto que distingue as duas camadas: sem os guards da
    // aplicação o teste ainda passaria, protegido só pelo banco.
    //
    // As DUAS mensagens abaixo são resultados corretos, e qual delas sai
    // depende de onde o perdedor perdeu a corrida:
    //   - o `findFirst` rodou DEPOIS do commit do vencedor → lê 0 e cai no gate
    //     de saldo ("Saldo insuficiente");
    //   - rodou ANTES → passa o gate com snapshot velho e cai no CAS
    //     ("saldo de cashback mudou").
    // Exigir só a segunda tornava o teste flaky (falhou no CI em 2026-08-04) e
    // testava IMPLEMENTAÇÃO — qual guarda disparou — em vez do comportamento,
    // que é "recusou com erro de negócio, sem vazar erro de banco".
    expect(motivo(r)[0]).toMatch(/saldo de cashback mudou|saldo insuficiente/i);
    expect(motivo(r)[0]).not.toMatch(/check constraint/i);
  });

  it("dois unlockBalance SIMULTÂNEOS da mesma reserva: só um vale", async () => {
    await caller().reward.lockBalance({ customerId, amountCents: 10000 });
    expect(await saldo()).toEqual({ disponivel: 0, reservado: 100 });

    const r = await Promise.allSettled([
      caller().reward.unlockBalance({ customerId, amountCents: 10000 }),
      caller().reward.unlockBalance({ customerId, amountCents: 10000 }),
    ]);

    // O INVARIANTE é o saldo: R$100 reservados liberam R$100, uma vez só —
    // nunca R$200, nunca reservado negativo. É isto que precisa valer sempre.
    expect(await saldo()).toEqual({ disponivel: 100, reservado: 0 });

    // O perdedor pode terminar de DUAS formas corretas, conforme onde perdeu:
    //   - leu a reserva ANTES do commit do vencedor → passa o clamp e cai no
    //     CAS ("reserva de cashback mudou");
    //   - leu DEPOIS → vê `locked = 0`, o clamp zera e o procedure devolve
    //     `{ unlocked: 0 }` sem erro (não há o que liberar).
    // Exigir sempre a rejeição testava IMPLEMENTAÇÃO. O que importa é que
    // ninguém liberou duas vezes e que, se houve erro, foi de NEGÓCIO — não a
    // CHECK do banco vazando "violates check constraint" para o usuário.
    const liberados = r
      .filter((x): x is PromiseFulfilledResult<{ unlocked: number }> => x.status === "fulfilled")
      .reduce((sum, x) => sum + x.value.unlocked, 0);
    expect(liberados).toBe(10000);
    for (const err of motivo(r)) {
      expect(err).toMatch(/reserva de cashback mudou/i);
      expect(err).not.toMatch(/check constraint/i);
    }
  });

  it("lock acima do disponível continua sendo recusado (caso simples)", async () => {
    await expect(
      caller().reward.lockBalance({ customerId, amountCents: 15000 }),
    ).rejects.toThrow(/saldo insuficiente/i);
    expect(await saldo()).toEqual({ disponivel: 100, reservado: 0 });
  });

  it("o banco é a rede final: CHECK barra saldo negativo escrito na marra", async () => {
    const b = await prisma.rewardBalance.findFirstOrThrow({ where: { tenantId, customerId } });
    await expect(
      prisma.rewardBalance.update({ where: { id: b.id }, data: { availableBalance: -1 } }),
    ).rejects.toThrow();
  });
});
