import type { Prisma, PrismaClient } from "@prisma/client"

/**
 * Abre um caixa de teste de forma IDEMPOTENTE.
 *
 * O banco tem `cash_sessions_one_open_per_user`:
 *   UNIQUE (tenant_id, user_id) WHERE closed_at IS NULL
 * ou seja, **um caixa aberto por usuário**.
 *
 * Os testes de integração compartilham o mesmo Postgres local e quase todos
 * operam com os mesmos usuários semeados ("Admin Arena", "Operador Arena").
 * Cada arquivo abria o próprio caixa e contava com `deleteMany` no `afterAll`
 * para limpar — mas esse delete falha quando a sessão já tem `cash_movements`
 * (FK), e não roda quando o arquivo aborta no meio. A sessão sobrevivia ABERTA
 * e o `create` do arquivo seguinte estourava a unique:
 *
 *   Unique constraint failed on the fields: (`tenant_id`, `user_id`)
 *
 * Como a ordem dos arquivos varia, a falha pulava de teste em teste e só
 * aparecia em ~60% das execuções da suíte completa — cara de "flaky", mas de
 * causa determinística.
 *
 * Este helper FECHA qualquer caixa aberto do usuário antes de abrir o novo.
 * Fechar (em vez de apagar) é seguro: não esbarra na FK dos movimentos e
 * preserva o histórico que outros testes porventura queiram inspecionar.
 */
export async function openTestCashSession(
  prisma: PrismaClient,
  args: { tenantId: string; userId: string; initialBalance?: number | Prisma.Decimal },
): Promise<{ id: string }> {
  await prisma.cashSession.updateMany({
    where: { tenantId: args.tenantId, userId: args.userId, closedAt: null },
    data: { closedAt: new Date() },
  })
  return prisma.cashSession.create({
    data: {
      tenantId: args.tenantId,
      userId: args.userId,
      initialBalance: args.initialBalance ?? 0,
    },
    select: { id: true },
  })
}

/**
 * Fecha os caixas abertos do usuário sem apagar nada. Use no `afterAll` em vez
 * de `deleteMany` quando a sessão puder ter movimentos: evita o erro de FK que
 * fazia a limpeza falhar em silêncio e vazar estado para o próximo arquivo.
 */
export async function closeTestCashSessions(
  prisma: PrismaClient,
  args: { tenantId: string; userId: string },
): Promise<void> {
  await prisma.cashSession.updateMany({
    where: { tenantId: args.tenantId, userId: args.userId, closedAt: null },
    data: { closedAt: new Date() },
  })
}
