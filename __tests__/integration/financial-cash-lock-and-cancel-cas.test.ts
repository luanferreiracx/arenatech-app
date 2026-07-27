/**
 * Auditoria 2026-07-25 — dois furos no financeiro.
 *
 * 1. `payInstallment`/`reverseInstallment` escreviam na gaveta SEM
 *    `lockOpenCashSessionOrThrow`. Entre o `findFirst` da sessão aberta e o
 *    `writeCashMovement`, o `cashier.close` podia fechar o caixa: o fechamento
 *    recalcula os movimentos e NÃO via este, então o dinheiro físico ficava
 *    fora do `expectedCash` e reaparecia como divergência fantasma na
 *    conferência. Os 4 escritores de `cashier.ts` já usavam o helper.
 *
 * 2. `financial.cancel` não tinha CAS. O status era lido no início da
 *    transação; um `payInstallment` concorrente podia baixar uma parcela e
 *    commitar antes da escrita. O `updateMany` das parcelas não tocaria a já
 *    PAID (fora do filtro) e o update forçava a conta para CANCELLED assim
 *    mesmo → conta CANCELLED com `paidAmount > 0`, parcela PAID, linha no
 *    ledger e dinheiro na gaveta: recebido numa conta que "não existe".
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
vi.mock("@/server/auth", () => ({ auth: async () => null }));
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createCallerFactory } from "@/server/api/trpc";
import { appRouter } from "@/server/api/root";
import { withTenant } from "@/server/db";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const MARK = "fin-lock-cas";
let tenantId: string, adminId: string, ctx: any;
const txIds: string[] = [];
const sessionIds: string[] = [];

const caller = () => createCallerFactory(appRouter)(ctx);

beforeAll(async () => {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "arena-tech" } });
  // Usuário DEDICADO para o caixa deste arquivo (o "Tecnico Arena" não é usado
  // por nenhum outro teste de caixa). Usar o "Admin Arena" fazia este arquivo
  // mexer na sessão de caixa que outros testes de integração compartilham no
  // mesmo Postgres local — as falhas apareciam em testes alheios, de forma
  // não-determinística. O papel `admin` vem do ctx, não do usuário.
  const admin = await prisma.user.findFirstOrThrow({ where: { name: "Tecnico Arena" } });
  tenantId = tenant.id;
  adminId = admin.id;
  ctx = {
    session: {
      user: { id: adminId, isSuperAdmin: false },
      activeTenantId: tenantId,
      availableTenants: [{ id: tenantId, slug: "arena-tech", role: "admin", modules: ["financial", "cashier"] }],
    },
    tenantId,
    withTenant: (fn: any) => withTenant(tenantId, fn),
  };
});

afterAll(async () => {
  await prisma.installmentPayment.deleteMany({ where: { transactionId: { in: txIds } } });
  await prisma.installment.deleteMany({ where: { transactionId: { in: txIds } } });
  await prisma.financialTransaction.deleteMany({ where: { id: { in: txIds } } });
  // Só as sessões que ESTE arquivo criou — apagar todas as do admin derrubava
  // outros testes que dependem do próprio caixa aberto (os testes de integração
  // compartilham o mesmo Postgres local).
  await prisma.cashMovement.deleteMany({ where: { cashSessionId: { in: sessionIds } } });
  await prisma.cashSession.deleteMany({ where: { id: { in: sessionIds } } });
  await prisma.$disconnect();
});

/**
 * Abre um caixa para o admin. Fecha (não apaga) qualquer sessão aberta dele
 * antes, porque o índice único parcial só permite uma aberta por usuário.
 */
async function abreCaixa() {
  await prisma.cashSession.updateMany({
    where: { userId: adminId, closedAt: null },
    data: { closedAt: new Date() },
  });
  const s = await prisma.cashSession.create({
    data: { tenantId, userId: adminId, initialBalance: 0 },
  });
  sessionIds.push(s.id);
  return s;
}

/** Conta a receber de R$100, dividida em `parcelas` (default 1). */
async function contaReceber(parcelas = 1) {
  const criada = await caller().financial.create({
    type: "RECEIVABLE",
    description: `${MARK}-conta`,
    totalAmount: 10000,
    numInstallments: parcelas,
    emissionDate: new Date().toISOString(),
    firstDueDate: new Date().toISOString().slice(0, 10),
  });
  txIds.push(criada.id);
  const lista = await prisma.installment.findMany({
    where: { transactionId: criada.id },
    orderBy: { number: "asc" },
  });
  return { id: criada.id, parcelaId: lista[0]!.id, parcelas: lista };
}

describe("financeiro — lock de caixa e CAS no cancelamento", () => {
  it("baixar parcela perde a corrida para o fechamento do caixa (lock)", async () => {
    const sessao = await abreCaixa();
    const { parcelaId } = await contaReceber();

    // Reproduz o interleaving REAL de forma determinística: uma conexão
    // paralela segura o row lock da sessão (ainda ABERTA, então o `findFirst`
    // do payInstallment a encontra) e só então a fecha. O payInstallment fica
    // bloqueado no `lockOpenCashSessionOrThrow`; quando o lock solta, o
    // Postgres reavalia o `WHERE closed_at IS NULL` e não acha mais nada.
    // Sem o lock, o payInstallment passaria direto e gravaria o movimento numa
    // sessão já fechada — dinheiro fora do `expectedCash` do fechamento.
    const outra = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
    let liberar!: () => void;
    const podeFechar = new Promise<void>((res) => {
      liberar = res;
    });
    const seguraLock = outra.$transaction(
      async (t) => {
        await t.$executeRaw`SELECT id FROM cash_sessions WHERE id = ${sessao.id}::uuid FOR UPDATE`;
        await podeFechar;
        await t.$executeRaw`UPDATE cash_sessions SET closed_at = now() WHERE id = ${sessao.id}::uuid`;
      },
      { timeout: 20_000 },
    );

    try {
      await new Promise((r) => setTimeout(r, 300)); // deixa o lock ser adquirido

      const pagamento = caller().financial.payInstallment({
        installmentId: parcelaId,
        amountPaid: 10000,
        paymentMethod: "dinheiro",
      });

      await new Promise((r) => setTimeout(r, 400)); // payInstallment já bloqueado no lock
      liberar();
      await seguraLock;

      await expect(pagamento).rejects.toThrow(/caixa foi fechado/i);

      // Nada gravado na sessão fechada, e a parcela não ficou baixada (rollback).
      expect(await prisma.cashMovement.count({ where: { cashSessionId: sessao.id } })).toBe(0);
      const parcela = await prisma.installment.findUniqueOrThrow({ where: { id: parcelaId } });
      expect(Number(parcela.paidAmount)).toBe(0);
    } finally {
      // `finally`: sem isto, um teste que falha antes do disconnect vaza a
      // conexão e o arquivo SEGUINTE quebra no beforeAll por falta de conexão.
      liberar();
      await outra.$disconnect();
    }
  });

  it("cancelar conta que recebeu pagamento no meio é bloqueado (CAS)", async () => {
    await abreCaixa();
    const { id, parcelas } = await contaReceber(2); // R$50 + R$50

    // Parcela 1 já paga: a conta fica PARTIALLY_PAID — exatamente o status que
    // o guard `status === "PAID"` NÃO pega, e por onde o bug passava.
    await caller().financial.payInstallment({
      installmentId: parcelas[0]!.id,
      amountPaid: 5000,
      paymentMethod: "dinheiro",
    });

    // Segura a LINHA DA CONTA numa conexão paralela e, com o cancel já parado
    // no update final (ou seja, DEPOIS de ter lido status/paidAmount), simula o
    // segundo pagamento commitando. Ao soltar, o CAS reavalia e não encontra
    // mais a conta como foi lida.
    // (Travar as PARCELAS não serve: o `updateMany` do cancel já as bloqueia,
    // e um payInstallment real esbarraria nele — deadlock no teste, não no
    // código. Por isso a mudança concorrente é aplicada direto na conta.)
    const outra = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
    let liberar!: () => void;
    const podeSoltar = new Promise<void>((res) => {
      liberar = res;
    });
    const seguraConta = outra.$transaction(
      async (t) => {
        await t.$executeRaw`SELECT id FROM financial_transactions WHERE id = ${id}::uuid FOR UPDATE`;
        await podeSoltar;
        await t.$executeRaw`UPDATE financial_transactions SET paid_amount = 100 WHERE id = ${id}::uuid`;
      },
      { timeout: 20_000 },
    );

    try {
      await new Promise((r) => setTimeout(r, 300));
      const cancelamento = caller().financial.cancel({ id });
      await new Promise((r) => setTimeout(r, 400));
      liberar();
      await seguraConta;

      await expect(cancelamento).rejects.toThrow(/mudou de status|pagamento concorrente/i);

      const conta = await prisma.financialTransaction.findUniqueOrThrow({ where: { id } });
      expect(conta.status).not.toBe("CANCELLED");
      expect(Number(conta.paidAmount)).toBe(100); // o pagamento concorrente sobreviveu
    } finally {
      liberar();
      await outra.$disconnect();
    }
  }, 20_000);

  it("cancelar conta pendente (sem pagamento) continua funcionando", async () => {
    await abreCaixa();
    const { id } = await contaReceber();

    await expect(caller().financial.cancel({ id })).resolves.toEqual({ success: true });

    const conta = await prisma.financialTransaction.findUniqueOrThrow({ where: { id } });
    expect(conta.status).toBe("CANCELLED");
  });
});
