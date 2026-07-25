import { Prisma } from "@prisma/client"

/**
 * Ledger de pagamentos (`installment_payments`) — ponto ÚNICO de escrita.
 *
 * O ledger é a fonte de verdade do REGIME DE CAIXA (FIN-B2): `installment.paidAt`
 * guarda só a ÚLTIMA data de pagamento, então uma parcela paga em 2 meses jogava
 * o valor inteiro no último mês. O ledger tem uma linha por evento, com data
 * própria; estorno entra como valor negativo, então `SUM(amount_cents)` já é o
 * líquido do mês.
 *
 * Dois relatórios leem SÓ daqui:
 *   - `financial.stats.paidMonthAmount` ("recebido/pago no mês")
 *   - a linha de DESPESAS do DRE (`financial.dre`)
 *
 * BUG (auditoria 2026-07-25): o ledger só era escrito em `payInstallment` e
 * `reverseInstallment`. Mas parcelas nascem PAID em outros caminhos — compra de
 * aparelho à vista, OS paga em dinheiro/pix, venda à vista não-cartão — e nenhum
 * deles gravava aqui. Medido em produção: R$ 342.130,00 em 62 compras de
 * aparelho fora da linha de despesa do DRE (24% da despesa do ano), inflando o
 * lucro; e R$ 266.952,33 em 425 recebimentos fora do "recebido no mês".
 *
 * Use `recordCashPaidTransaction` para lançamento à vista (cria a parcela única
 * + a linha do ledger) e `recordInstallmentPayment` quando a parcela já existe.
 */

/**
 * Registra o evento de pagamento de uma parcela JÁ EXISTENTE.
 *
 * @param amountCents positivo = pagamento; negativo = estorno
 */
export async function recordInstallmentPayment(
  tx: Prisma.TransactionClient,
  args: {
    tenantId: string
    installmentId: string
    transactionId: string
    amountCents: number
    paymentMethod?: string | null
    paidAt: Date
    kind?: "payment" | "reversal"
    createdByUserId?: string | null
  },
): Promise<void> {
  await tx.installmentPayment.create({
    data: {
      tenantId: args.tenantId,
      installmentId: args.installmentId,
      transactionId: args.transactionId,
      amountCents: args.amountCents,
      paymentMethod: args.paymentMethod ?? null,
      paidAt: args.paidAt,
      kind: args.kind ?? "payment",
      createdByUserId: args.createdByUserId ?? null,
    },
  })
}

/**
 * Lançamento À VISTA (`installmentsTotal: 1`, nasce PAID): cria a parcela única
 * que o registro já promete e a linha correspondente no ledger.
 *
 * Sem isto o lançamento existe como `FinancialTransaction` PAID mas é invisível
 * para o DRE e para o "recebido/pago no mês", que leem do ledger.
 */
export async function recordCashPaidTransaction(
  tx: Prisma.TransactionClient,
  args: {
    tenantId: string
    transactionId: string
    amountCents: number
    paidAt: Date
    dueDate?: Date
    paymentMethod?: string | null
    createdByUserId?: string | null
  },
): Promise<{ installmentId: string }> {
  const installment = await tx.installment.create({
    data: {
      tenantId: args.tenantId,
      transactionId: args.transactionId,
      number: 1,
      amount: new Prisma.Decimal(args.amountCents).div(100),
      paidAmount: new Prisma.Decimal(args.amountCents).div(100),
      dueDate: args.dueDate ?? args.paidAt,
      paidAt: args.paidAt,
      paidByUserId: args.createdByUserId ?? null,
      paymentMethod: args.paymentMethod ?? null,
      status: "PAID",
    },
    select: { id: true },
  })

  await recordInstallmentPayment(tx, {
    tenantId: args.tenantId,
    installmentId: installment.id,
    transactionId: args.transactionId,
    amountCents: args.amountCents,
    paymentMethod: args.paymentMethod,
    paidAt: args.paidAt,
    kind: "payment",
    createdByUserId: args.createdByUserId,
  })

  return { installmentId: installment.id }
}
