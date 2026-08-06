/**
 * Auditoria 2026-08-05 (P1-B8): FK composta (tenant_id, id) nas relacoes de
 * dinheiro.
 *
 * Com dois tenants reais no banco, a auditoria PROVOU que a escrita cross-tenant
 * passava: o RLS bloqueia a LEITURA da linha alheia, mas a verificacao de FK
 * roda com privilegio interno e ignora RLS. Um movimento de caixa do tenant B
 * podia apontar para a sessao do tenant A.
 *
 * A aplicacao nao expunha o caminho (os 19 call sites derivam a sessao de uma
 * query ja escopada), mas `cashier.forceClose` depende SO do RLS — e a proxima
 * procedure que aceitar um id do cliente e esquecer o filtro reabre o buraco.
 * Esta e a rede que existe para quando isso acontecer.
 *
 * O teste opera direto no banco, sob `app_user` + `SET LOCAL app.current_tenant_id`,
 * porque e exatamente essa a superficie: a garantia e do POSTGRES, nao do app.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const MARK = "fk-composta-test";
let tenantA: string, tenantB: string, userA: string;

beforeAll(async () => {
  const a = await prisma.tenant.findUniqueOrThrow({ where: { slug: "arena-tech" } });
  tenantA = a.id;
  userA = (await prisma.user.findFirstOrThrow({ where: { name: "Admin Arena" } })).id;

  // Tenant B so existe para este teste: o buraco so e observavel com DOIS.
  const b = await prisma.tenant.upsert({
    where: { slug: `${MARK}-b` },
    create: { slug: `${MARK}-b`, name: "Tenant B (FK composta)", status: "ACTIVE" },
    update: {},
  });
  tenantB = b.id;
});

afterAll(async () => {
  await prisma.tenant.deleteMany({ where: { slug: `${MARK}-b` } });
  await prisma.$disconnect();
});

/** Roda um SQL como `app_user` no escopo do tenant informado. */
async function comoTenant(tenantId: string, sql: string) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL ROLE app_user`);
    await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant_id = '${tenantId}'`);
    return tx.$executeRawUnsafe(sql);
  });
}

describe("B8 — FK composta (tenant_id, id) nas relacoes de dinheiro", () => {
  it("as quatro constraints existem no banco", async () => {
    const rows = await prisma.$queryRaw<Array<{ conname: string }>>`
      SELECT conname FROM pg_constraint
      WHERE contype = 'f' AND conname IN (
        'cash_movements_tenant_id_cash_session_id_fkey',
        'installment_payments_tenant_id_installment_id_fkey',
        'installments_tenant_id_transaction_id_fkey',
        'sale_items_tenant_id_sale_id_fkey'
      )
    `;
    expect(rows.map((r) => r.conname).sort()).toEqual([
      "cash_movements_tenant_id_cash_session_id_fkey",
      "installment_payments_tenant_id_installment_id_fkey",
      "installments_tenant_id_transaction_id_fkey",
      "sale_items_tenant_id_sale_id_fkey",
    ]);
  });

  it("movimento de caixa do tenant B NAO pode apontar para sessao do tenant A", async () => {
    const sessao = await prisma.cashSession.findFirstOrThrow({
      where: { tenantId: tenantA },
      select: { id: true },
    });

    // Este e o INSERT que a auditoria conseguiu executar em 2026-08-05.
    await expect(
      comoTenant(
        tenantB,
        `INSERT INTO cash_movements (id, tenant_id, cash_session_id, type, nature, amount, payment_method, description, created_by_user_id, created_at)
         VALUES (gen_random_uuid(), '${tenantB}', '${sessao.id}', 'SALE', 'INCOME', 1.00, 'dinheiro', '${MARK}', '${userA}', now())`,
      ),
    ).rejects.toThrow(/foreign key|violates/i);
  });

  it("pagamento do tenant B NAO pode apontar para parcela do tenant A", async () => {
    const parcela = await prisma.installment.findFirst({
      where: { tenantId: tenantA },
      select: { id: true, transactionId: true },
    });
    if (!parcela) return; // banco sem parcelas: nada a exercer

    const conta = await prisma.receivingAccount.findFirst({
      where: { tenantId: tenantA },
      select: { id: true },
    });
    if (!conta) return;

    await expect(
      comoTenant(
        tenantB,
        `INSERT INTO installment_payments (id, tenant_id, installment_id, transaction_id, amount_cents, paid_at, kind, created_at, receiving_account_id)
         VALUES (gen_random_uuid(), '${tenantB}', '${parcela.id}', '${parcela.transactionId}', 100, now(), 'payment', now(), '${conta.id}')`,
      ),
    ).rejects.toThrow(/foreign key|violates/i);
  });

  it("o CASCADE das FKs antigas continua funcionando (controle negativo)", async () => {
    // A composta com RESTRICT ao lado de uma simples com CASCADE BLOQUEARIA o
    // cascade — o delete da venda passaria a falhar. As tres CASCADE precisam
    // continuar iguais.
    const rows = await prisma.$queryRaw<Array<{ conname: string; def: string }>>`
      SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint
      WHERE conname IN (
        'sale_items_tenant_id_sale_id_fkey',
        'installments_tenant_id_transaction_id_fkey',
        'installment_payments_tenant_id_installment_id_fkey'
      )
    `;
    for (const r of rows) {
      expect(r.def, `${r.conname} precisa manter ON DELETE CASCADE`).toMatch(/ON DELETE CASCADE/);
    }
  });
});
