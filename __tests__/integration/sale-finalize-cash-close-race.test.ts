/**
 * Auditoria 2026-08-05 (P1-B9): corrida fechar-caixa x finalizar-venda.
 *
 * `financial.payInstallment` e `reverseInstallment` chamam
 * `lockOpenCashSessionOrThrow` antes de escrever na gaveta. O `finalize` da
 * venda NAO: le a sessao com `findFirst` e segue. `cashier.ts` documenta a
 * janela e o follow-up:
 *
 *   "Re-le os movimentos TAO TARDE quanto possivel (apos o claim) [...] encolhe
 *    a janela da corrida fechar-caixa x finalizar-venda a ~zero. (Eliminacao
 *    total exigiria SELECT ... FOR UPDATE no finalize — follow-up documentado.)"
 *
 * O follow-up nunca foi feito. Medido em producao: 0 movimentos gravados apos o
 * `closed_at` da sessao, em 1.796 — a janela e de milissegundos e ha um operador
 * so. Com varias lojas e caixas simultaneos a exposicao sobe, e o sintoma seria
 * dinheiro fora da conferencia: a venda entra na gaveta de uma sessao ja
 * fechada, e o relatorio de fechamento nao a contem.
 *
 * O QUE ESTE TESTE AFIRMA: o invariante — nenhum `CashMovement` com
 * `createdAt > closedAt` da sua sessao. NAO afirma qual guarda disparou nem quem
 * venceu a corrida: as duas ordens sao corretas (ou a venda entra e o fechamento
 * a conta, ou o fechamento vence e a venda e recusada). Afirmar a implementacao
 * e o que torna teste de corrida flaky.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
vi.mock("@/server/auth", () => ({ auth: async () => null }));
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createCallerFactory } from "@/server/api/trpc";
import { appRouter } from "@/server/api/root";
import { withTenant } from "@/server/db";
import { openTestCashSession, closeTestCashSessions } from "../helpers/cash-session";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const MARK = "finalize-close-race";
let ctx: any, tenantId: string, adminId: string, productId: string;
const saleIds: string[] = [];

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
      availableTenants: [
        {
          id: tenantId,
          slug: "arena-tech",
          role: "admin",
          modules: ["pdv", "pdv-retail", "cashier", "financial", "stock"],
        },
      ],
    },
    tenantId,
    withTenant: (fn: any) => withTenant(tenantId, fn),
  };

  productId = (
    await prisma.product.create({
      data: {
        tenantId,
        name: `${MARK}-produto`,
        salePrice: 100,
        costPrice: 40,
        currentStock: 500,
        isSerialized: false,
        hasVariations: false,
        active: true,
      },
    })
  ).id;
});

afterAll(async () => {
  for (const id of saleIds) {
    await prisma.cashMovement.deleteMany({ where: { referenceId: id } });
    await prisma.saleItem.deleteMany({ where: { saleId: id } });
    await prisma.sale.deleteMany({ where: { id } });
  }
  await prisma.stockMovement.deleteMany({ where: { productId } });
  await prisma.product.deleteMany({ where: { id: productId } });
  await closeTestCashSessions(prisma, { tenantId, userId: adminId });
  await prisma.$disconnect();
});

/** Venda em dinheiro pronta para finalizar (DRAFT com um item). */
async function makeDraftSale(): Promise<string> {
  const sale = await caller().sale.createDraft();
  saleIds.push(sale.id);
  await caller().sale.addItem({ saleId: sale.id, productId, quantity: 1, unitPrice: 10000 });
  return sale.id;
}

describe("B9 — finalizar venda x fechar caixa (ao vivo)", () => {
  /**
   * RODADAS: a janela e de milissegundos, entao uma tentativa passa mesmo com o
   * bug (foi o que a producao mostrou: 0 ocorrencias em 1.796 movimentos). Com
   * repeticao a chance de pegar sobe, e o custo e baixo — cada rodada e uma
   * venda de um item.
   */
  const RODADAS = 12;

  it(`nenhum movimento cai numa sessao ja fechada, em ${RODADAS} rodadas`, async () => {
    const sessionIds: string[] = [];

    for (let i = 0; i < RODADAS; i++) {
      await closeTestCashSessions(prisma, { tenantId, userId: adminId });
      const session = await openTestCashSession(prisma, { tenantId, userId: adminId, initialBalance: 100 });
      sessionIds.push(session.id);
      const saleId = await makeDraftSale();

      // Escalona o atraso do fechamento pela rodada: com as duas saindo no mesmo
      // tick, uma vencia sempre (medido: 12/12 para o mesmo lado) e a corrida
      // nunca era exercida. Variar o offset faz o fechamento cair em pontos
      // diferentes da transacao do finalize — inclusive DEPOIS de ele ler a
      // sessao e ANTES de gravar o movimento, que e a janela do bug.
      const atrasoMs = i * 3;
      const [fin, clo] = await Promise.allSettled([
        caller().sale.finalize({ saleId, payments: [{ method: "dinheiro", amount: 10000 }] }),
        new Promise((r) => setTimeout(r, atrasoMs)).then(() =>
          caller().cashier.close({ declaredBalance: 100, closingNote: "fechamento de teste (corrida B9)" }),
        ),
      ]);
      expect(
        fin.status === "fulfilled" || clo.status === "fulfilled",
        `rodada ${i}: as duas operacoes falharam; a corrida nao foi exercida`,
      ).toBe(true);
    }

    const orfaos = await prisma.$queryRaw<Array<{ n: bigint }>>`
      SELECT count(*)::bigint AS n
      FROM cash_movements m
      JOIN cash_sessions s ON s.id = m.cash_session_id
      WHERE s.id = ANY(${sessionIds}::uuid[])
        AND s.closed_at IS NOT NULL
        AND m.created_at > s.closed_at
    `;
    expect(Number(orfaos[0]!.n), "movimento gravado em sessao ja fechada").toBe(0);
  });

  it("uma rodada isolada tambem nao deixa movimento orfao", async () => {
    await closeTestCashSessions(prisma, { tenantId, userId: adminId });
    const session = await openTestCashSession(prisma, { tenantId, userId: adminId, initialBalance: 100 });
    const saleId = await makeDraftSale();

    // Dispara as duas operacoes sem esperar uma pela outra: e isso que abre a
    // janela. Ambas podem falhar de forma legitima — o que nao pode e a venda
    // entrar numa gaveta ja fechada.
    const [finalize, close] = await Promise.allSettled([
      caller().sale.finalize({ saleId, payments: [{ method: "dinheiro", amount: 10000 }] }),
      caller().cashier.close({ declaredBalance: 100, closingNote: "fechamento de teste (corrida B9)" }),
    ]);

    // Pelo menos uma tem que ter terminado — se as duas falharem, o teste nao
    // exerceu nada e vira falso verde.
    expect(
      finalize.status === "fulfilled" || close.status === "fulfilled",
      "as duas operacoes falharam; a corrida nao foi exercida",
    ).toBe(true);

    const orfaos = await prisma.$queryRaw<Array<{ n: bigint }>>`
      SELECT count(*)::bigint AS n
      FROM cash_movements m
      JOIN cash_sessions s ON s.id = m.cash_session_id
      WHERE s.id = ${session.id}::uuid
        AND s.closed_at IS NOT NULL
        AND m.created_at > s.closed_at
    `;
    expect(Number(orfaos[0]!.n), "movimento gravado em sessao ja fechada").toBe(0);
  });

  it("venda em dinheiro com o caixa FECHADO e recusada (controle negativo)", async () => {
    await closeTestCashSessions(prisma, { tenantId, userId: adminId });
    const saleId = await makeDraftSale();

    await expect(
      caller().sale.finalize({ saleId, payments: [{ method: "dinheiro", amount: 10000 }] }),
    ).rejects.toThrow();

    // O que importa nao e a mensagem, e o invariante: sem caixa aberto, nenhum
    // movimento foi gravado para esta venda.
    const movimentos = await prisma.cashMovement.count({ where: { referenceId: saleId } });
    expect(movimentos).toBe(0);
  });
});
