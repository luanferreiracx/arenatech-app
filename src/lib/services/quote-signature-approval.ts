import { Prisma, type ServiceOrderStatus } from "@prisma/client";
import { withAdmin } from "@/server/db";
import { logger } from "@/lib/logger";

/**
 * Aprova uma revisao de orcamento (ServiceOrderQuote) quando o cliente assina
 * o documento no Autentique. Usado pelo webhook do Autentique — o orcamento
 * revisado segue o mesmo fluxo de assinatura digital da OS de entrada.
 *
 * Espelha applyQuoteApproval do service-order router: os itens ja sao a fonte
 * da verdade (totais ja refletem a alteracao), entao aqui apenas registra o
 * snapshot aprovado, limpa a pendencia e restaura o status anterior.
 *
 * Idempotente: se o quote ja nao estiver `pending`, nao faz nada.
 *
 * @returns `null` se nenhum quote pendente correspondia ao documentId, ou um
 *   objeto com `{ orderId }` quando a aprovacao foi aplicada.
 */
export async function approveQuoteBySignature(
  documentId: string,
  signedAt: Date,
): Promise<{ orderId: string } | null> {
  return withAdmin(async (tx) => {
    const quote = await tx.serviceOrderQuote.findFirst({
      where: { signatureDocumentId: documentId },
    });
    if (!quote) return null; // nao e um quote — pode ser OS de entrada

    if (quote.status !== "pending") {
      logger.info("Quote ja processado — webhook Autentique idempotente", {
        quoteId: quote.id,
        status: quote.status,
      });
      return null;
    }

    const order = await tx.serviceOrder.findUnique({ where: { id: quote.orderId } });
    if (!order || order.deletedAt) {
      logger.warn("Quote assinado mas OS nao encontrada/excluida", {
        quoteId: quote.id,
        orderId: quote.orderId,
      });
      return null;
    }

    const items = await tx.serviceOrderItem.findMany({ where: { orderId: order.id } });

    await tx.serviceOrderQuote.update({
      where: { id: quote.id },
      data: {
        status: "approved",
        approvedAt: signedAt,
        signedAt,
        newItemsSnapshot: snapshotItems(items) as unknown as Prisma.InputJsonValue,
      },
    });

    const restoredStatus = await resolveStatusAfterQuoteApproval(tx, order.id);
    await tx.serviceOrder.update({
      where: { id: order.id },
      data: { pendingQuoteId: null, budgetPending: false, status: restoredStatus },
    });

    await tx.serviceOrderHistory.create({
      data: {
        tenantId: order.tenantId,
        orderId: order.id,
        userId: order.createdById,
        previousStatus: "WAITING_APPROVAL",
        newStatus: restoredStatus,
        notes: "Orcamento aprovado pelo cliente via assinatura digital (Autentique)",
      },
    });

    return { orderId: order.id };
  });
}

type QuoteItem = {
  type: "SERVICE" | "PRODUCT";
  serviceId: string | null;
  productId: string | null;
  variationId: string | null;
  description: string;
  quantity: Prisma.Decimal;
  unitPrice: Prisma.Decimal;
  costPrice: Prisma.Decimal;
  total: Prisma.Decimal;
};

function snapshotItems(items: QuoteItem[]) {
  return items.map((i) => ({
    type: i.type,
    serviceId: i.serviceId ?? null,
    productId: i.productId ?? null,
    variationId: i.variationId ?? null,
    description: i.description,
    quantity: Number(i.quantity),
    unitPrice: decimalToCents(i.unitPrice),
    costPrice: decimalToCents(i.costPrice),
    total: decimalToCents(i.total),
  }));
}

function decimalToCents(v: Prisma.Decimal | null | undefined): number {
  if (!v) return 0;
  return Math.round(Number(v) * 100);
}

/**
 * Le o ultimo serviceOrderHistory com newStatus=WAITING_APPROVAL — ele guarda
 * em previousStatus o status que a OS estava antes do quote. Fallback: APPROVED.
 */
async function resolveStatusAfterQuoteApproval(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any,
  orderId: string,
): Promise<ServiceOrderStatus> {
  const lastWaiting = await tx.serviceOrderHistory.findFirst({
    where: { orderId, newStatus: "WAITING_APPROVAL" },
    orderBy: { createdAt: "desc" },
    select: { previousStatus: true },
  });
  return (lastWaiting?.previousStatus as ServiceOrderStatus | null) ?? "APPROVED";
}
