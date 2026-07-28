import { Prisma } from "@prisma/client"
import { TRPCError } from "@trpc/server"

/**
 * Impede DESFAZER uma venda ou OS que ainda tem documento fiscal VIVO.
 *
 * Auditoria 2026-07-25 (decisão do dono 2026-07-27: BLOQUEAR): os dois lados
 * eram independentes — `sale.ts` e `service-order.ts` não mencionavam `invoice`
 * uma única vez. Estornar uma venda de R$5.000 deixava a NF-e dela
 * `AUTHORIZED` na SEFAZ.
 *
 * Consequência: o relatório fiscal (`report.nfReport` filtra
 * `status: { not: "CANCELLED" }`) segue contando a nota, então a loja declara —
 * e recolhe imposto sobre — faturamento de uma venda que não existe mais. O
 * livro fiscal deixa de bater com a operação, em silêncio, até a apuração.
 *
 * Bloquear é o caminho que não deixa passar despercebido: o operador é obrigado
 * a cancelar a nota primeiro (fluxo que já existe e agora é só-admin). As
 * alternativas descartadas foram cancelar automático na SEFAZ (só funciona
 * dentro da janela de 24h; fora dela falha e vira carta de correção ou nota de
 * devolução) e apenas sinalizar na UI (depende de alguém olhar).
 *
 * "Desfazer" tem duas formas, e AS DUAS precisam do guard:
 *  - ESTORNO (#723): venda/OS já paga, reverte o dinheiro.
 *  - CANCELAMENTO (item 26): OS ainda não paga. `createFromServiceOrder` aceita
 *    OS em QUALQUER status, então dá para emitir a nota antes do pagamento e
 *    cancelar a OS depois — mesmo buraco, por outra porta.
 *
 * CANCELLED/REJECTED não contam — nota já desfeita não impede nada.
 */
export async function assertNoActiveInvoiceBlockingUndo(
  tx: Prisma.TransactionClient,
  args: {
    tenantId: string
    referenceType: "SALE" | "SERVICE_ORDER"
    referenceId: string
    /** Rótulo do registro na mensagem ("venda" | "OS"). */
    label: string
    /** O que o operador está tentando fazer, para a mensagem. */
    operacao: "estornar" | "cancelar"
  },
): Promise<void> {
  const nota = await tx.invoice.findFirst({
    where: {
      tenantId: args.tenantId,
      referenceType: args.referenceType,
      referenceId: args.referenceId,
      status: { notIn: ["CANCELLED", "REJECTED"] },
    },
    select: { number: true, status: true },
  })
  if (!nota) return

  throw new TRPCError({
    code: "BAD_REQUEST",
    message: nota.number
      ? `Esta ${args.label} tem a nota fiscal ${nota.number} ativa. Cancele a nota antes de ${args.operacao} — senao o faturamento declarado inclui uma ${args.label} que deixou de existir.`
      : `Esta ${args.label} tem um documento fiscal em andamento. Cancele-o antes de ${args.operacao}.`,
  })
}
