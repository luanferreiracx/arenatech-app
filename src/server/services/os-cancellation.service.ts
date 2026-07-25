import { Prisma } from "@prisma/client"
import { TRPCError } from "@trpc/server"
import { isCancellableOsStatus, isRefundableOsStatus } from "@/lib/validators/service-order"
import { releaseAllOsItems } from "./os-stock.service"

/**
 * Cancelamento de OS — ponto ÚNICO de verdade.
 *
 * Auditoria 2026-07-25: havia 4 caminhos que gravavam `status: "CANCELLED"` na
 * OS e apenas o `cancel` fazia o trabalho de cancelamento. Os caminhos do termo
 * de devolução (`confirmPhysicalReturnTerm`, `checkReturnTermStatus` e o
 * `confirmPhysicalSignature` com type="return") escreviam o status com um
 * `update()` cru e pulavam TUDO:
 *
 *   - o estoque reservado nunca voltava (peça sumia do inventário para sempre);
 *   - os recebíveis pendentes seguiam vencendo eternamente;
 *   - não havia CAS (dois cancelamentos concorrentes liberavam estoque em dobro,
 *     porque `releaseAllOsItems` usa `increment`, que não é idempotente);
 *   - não havia guard de status: uma OS PAID/DELIVERED virava CANCELLED sem
 *     estorno, e o `refund` ficava inalcançável (não aceita CANCELLED);
 *   - não havia RBAC: operador comum passava por cima do gate do `cancel`.
 *
 * Esta função concentra os invariantes. Todo caminho novo que precise cancelar
 * uma OS deve chamá-la em vez de gravar o status na mão.
 */

export type ApplyOsCancellationResult = {
  releasedCount: number
  cancelledReceivables: number
  previousStatus: string
}

/**
 * Aplica o cancelamento completo da OS: CAS de status → libera estoque →
 * cancela recebíveis pendentes.
 *
 * O CAS vem ANTES dos efeitos de propósito (mesmo motivo do F6): quem perde a
 * corrida aborta sem liberar estoque nenhum.
 *
 * @throws TRPCError CONFLICT se o status mudou no meio (perdeu o CAS)
 * @throws TRPCError BAD_REQUEST se o status atual não é cancelável
 */
export async function applyOsCancellation(
  tx: Prisma.TransactionClient,
  args: {
    tenantId: string
    orderId: string
    userId: string
    /** Status lido no início da transação (âncora do CAS). */
    currentStatus: string
    reason: string
    /** Nota extra no histórico (ex.: "[FORCADO SEM TERMO DE DEVOLUCAO]"). */
    historyPrefix?: string | null
  },
): Promise<ApplyOsCancellationResult> {
  // Mesma regra do `cancel` — fonte única em validators/service-order.
  if (!isCancellableOsStatus(args.currentStatus)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: isRefundableOsStatus(args.currentStatus)
        ? "Esta OS já foi paga. Use 'Estornar' para reverter o pagamento."
        : "Nao e possivel cancelar uma OS concluida, finalizada ou ja cancelada.",
    })
  }

  // CAS ancorado no status lido: serializa cancelamentos concorrentes.
  const cas = await tx.serviceOrder.updateMany({
    where: { id: args.orderId, status: args.currentStatus as never },
    data: { status: "CANCELLED", cancellationReason: args.reason },
  })
  if (cas.count !== 1) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "A OS mudou de status durante o cancelamento. Recarregue e tente novamente.",
    })
  }

  const releasedCount = await releaseAllOsItems(tx, args.tenantId, args.userId, args.orderId)

  // Recebíveis pendentes: sem isso, parcelas de uma OS cancelada seguiam
  // vencendo e quebravam o dashboard de contas a receber.
  const pendingTransactions = await tx.financialTransaction.findMany({
    where: { serviceOrderId: args.orderId, status: { notIn: ["CANCELLED", "PAID"] } },
    select: { id: true },
  })
  for (const t of pendingTransactions) {
    await tx.installment.updateMany({
      where: { transactionId: t.id, status: { in: ["PENDING", "OVERDUE"] } },
      data: { status: "CANCELLED" },
    })
    await tx.financialTransaction.update({
      where: { id: t.id },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancelledByUserId: args.userId,
        cancelReason: `OS cancelada: ${args.reason}`,
      },
    })
  }

  const noteParts: string[] = []
  if (args.historyPrefix) noteParts.push(args.historyPrefix)
  noteParts.push(args.reason)
  if (releasedCount > 0) noteParts.push(`(${releasedCount} item(ns) de estoque liberado(s))`)
  if (pendingTransactions.length > 0) {
    noteParts.push(`(${pendingTransactions.length} recebivel(is) cancelado(s))`)
  }

  await tx.serviceOrderHistory.create({
    data: {
      tenantId: args.tenantId,
      orderId: args.orderId,
      userId: args.userId,
      previousStatus: args.currentStatus as never,
      newStatus: "CANCELLED",
      notes: noteParts.join(" "),
    },
  })

  return {
    releasedCount,
    cancelledReceivables: pendingTransactions.length,
    previousStatus: args.currentStatus,
  }
}
