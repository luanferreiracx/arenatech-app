import type { Prisma } from "@prisma/client"
import { TRPCError } from "@trpc/server"

/**
 * De onde saiu / para onde entrou o dinheiro — ponto ÚNICO de resolução da
 * conta (ADR 0069).
 *
 * O sistema sabia COMO o dinheiro se moveu (`paymentMethod`) e nunca DE ONDE.
 * Sem conta não há conciliação bancária nem "quanto tem em cada conta". Esta
 * função é o único lugar que responde essa pergunta, para que venda, OS,
 * compra, despesa manual e cron não divirjam.
 *
 * Ordem de resolução, do mais específico ao mais geral:
 *
 *   1. conta escolhida explicitamente pelo operador
 *   2. conta padrão da FORMA de pagamento ("PIX Nubank" → conta Nubank)
 *   3. conta marcada `isDefault` no tenant
 *   4. null
 *
 * O passo 2 é o de maior alavancagem: cadastrado uma vez, o dia a dia resolve
 * sozinho. O passo 4 é deliberado — **conta errada é pior que conta ausente**.
 * Dado errado dá falso negativo silencioso na conciliação; nulo aparece como
 * "sem conta" no relatório e pede correção. Nunca inventamos conta.
 */

/** Só o que o resolver precisa do client — facilita testar sem banco. */
type AccountResolverTx = {
  paymentMethod: {
    findFirst: (args: {
      where: Record<string, unknown>
      select: Record<string, boolean>
    }) => Promise<{ defaultReceivingAccountId: string | null } | null>
  }
  receivingAccount: {
    findFirst: (args: {
      where: Record<string, unknown>
      select: Record<string, boolean>
    }) => Promise<{ id: string } | null>
  }
}

export interface ResolveReceivingAccountArgs {
  tenantId: string
  /** Conta escolhida na tela. Vence tudo. */
  explicitAccountId?: string | null
  /**
   * Id da FORMA de pagamento (não o token). Só o id resolve a conta padrão —
   * `code` é NULL em boa parte dos tenants (ver `cash-method.ts`), então nunca
   * casamos por code aqui.
   */
  paymentMethodId?: string | null
}

/**
 * @returns id da conta, ou `null` quando não dá para afirmar qual é.
 */
export async function resolveReceivingAccountId(
  tx: AccountResolverTx,
  args: ResolveReceivingAccountArgs,
): Promise<string | null> {
  // 1. Escolha explícita do operador. Validada contra o tenant — não confiamos
  //    no id que vem do cliente (a RLS já filtraria, mas o erro silencioso
  //    seria "conta some", e queremos que o caminho seja explícito).
  if (args.explicitAccountId) {
    const chosen = await tx.receivingAccount.findFirst({
      where: { id: args.explicitAccountId, tenantId: args.tenantId },
      select: { id: true },
    })
    if (chosen) return chosen.id
  }

  // 2. Conta padrão da forma de pagamento.
  if (args.paymentMethodId) {
    const method = await tx.paymentMethod.findFirst({
      where: { id: args.paymentMethodId, tenantId: args.tenantId },
      select: { defaultReceivingAccountId: true },
    })
    if (method?.defaultReceivingAccountId) {
      // A conta pode ter sido desativada depois de virar padrão da forma —
      // nesse caso cai para o passo 3 em vez de apontar para conta morta.
      const stillUsable = await tx.receivingAccount.findFirst({
        where: {
          id: method.defaultReceivingAccountId,
          tenantId: args.tenantId,
          active: true,
        },
        select: { id: true },
      })
      if (stillUsable) return stillUsable.id
    }
  }

  // 3. Conta padrão do tenant. Índice único parcial
  //    (`receiving_accounts_one_default_per_tenant`) garante no BANCO que só
  //    existe uma — antes eram dois `updateMany` imperativos, e dois admins
  //    concorrentes deixavam duas, tornando este `findFirst` não-determinístico.
  const tenantDefault = await tx.receivingAccount.findFirst({
    where: { tenantId: args.tenantId, isDefault: true, active: true },
    select: { id: true },
  })
  if (tenantDefault) return tenantDefault.id

  // 4. Nenhuma conta padrão. Último recurso: QUALQUER conta ativa do tenant.
  //    Só acontece se o admin desmarcou o padrão sem marcar outro — o dado
  //    ainda é honesto (é uma conta real do tenant) e evita travar a venda por
  //    um detalhe de configuração.
  const anyActive = await tx.receivingAccount.findFirst({
    where: { tenantId: args.tenantId, active: true },
    select: { id: true },
  })
  return anyActive?.id ?? null
}

/**
 * Igual a `resolveReceivingAccountId`, mas EXIGE resposta — a conta é
 * obrigatória no ledger (ADR 0069 fase 2).
 *
 * Só devolve null se o tenant não tem NENHUMA conta ativa, o que não deveria
 * acontecer: a migration criou "Caixa da Loja" para todos e `tenantFinancialInit`
 * cria para os novos. Se acontecer, é configuração quebrada (admin desativou a
 * última conta) e o erro precisa ser ALTO: falhar aqui é melhor que gravar
 * dinheiro sem origem e descobrir na conciliação, meses depois.
 *
 * @throws TRPCError PRECONDITION_FAILED com instrução acionável.
 */
export async function requireReceivingAccountId(
  tx: Prisma.TransactionClient,
  args: ResolveReceivingAccountArgs,
): Promise<string> {
  const resolved = await resolveAccountId(tx, args)
  if (resolved) return resolved
  throw new TRPCError({
    code: "PRECONDITION_FAILED",
    message:
      "Nenhuma conta de recebimento ativa. Cadastre uma conta em Configuracoes > Cartoes e Recebimento > Contas de Recebimento antes de registrar movimento de dinheiro.",
  })
}

/** Versão tipada para uso com o client real dentro de `withTenant`. */
export function resolveAccountId(
  tx: Prisma.TransactionClient,
  args: ResolveReceivingAccountArgs,
): Promise<string | null> {
  return resolveReceivingAccountId(tx as unknown as AccountResolverTx, args)
}
