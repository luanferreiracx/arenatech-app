import { Prisma } from "@prisma/client";

// `any` para suportar PrismaClient e o tx de withTenant — padrao do repo.
type TxClient = any;

/**
 * Gera a conta a pagar (PAYABLE) da comissao do prestador externo ao finalizar
 * o pagamento de uma OS. `ServiceProvider` nao e `User`, entao nao cabe na
 * apuracao do sistema Provider (keyed por `userId`) — o prestador externo e pago
 * como despesa, via PAYABLE, usando `ServiceProvider.commissionRate` (ADR 0056).
 *
 * Idempotente: nao duplica se ja existe PAYABLE nao-cancelada para a OS (reenvio,
 * retry, ou os dois caminhos de pagamento — registerPayment e finalize do PDV).
 * Sem `serviceProviderId`, sem `commissionRate`, ou base <= 0 → no-op.
 */
export async function createOsServiceProviderPayable(
  tx: TxClient,
  tenantId: string,
  order: { id: string; number: string; serviceProviderId: string | null },
  baseAmountCents: number,
  createdByUserId: string | null,
): Promise<void> {
  if (!order.serviceProviderId || baseAmountCents <= 0) return;

  const provider = await tx.serviceProvider.findFirst({
    where: { id: order.serviceProviderId, tenantId, deletedAt: null },
    select: { name: true, commissionRate: true },
  });
  const ratePercent = provider?.commissionRate ? Number(provider.commissionRate) : 0;
  if (!provider || ratePercent <= 0) return;

  const commissionCents = Math.round(baseAmountCents * (ratePercent / 100));
  if (commissionCents <= 0) return;

  // Idempotencia: nao duplicar a PAYABLE da comissao para a mesma OS.
  const existing = await tx.financialTransaction.findFirst({
    where: {
      tenantId,
      type: "PAYABLE",
      referenceType: "service_order_commission",
      referenceId: order.id,
      status: { not: "CANCELLED" },
      deletedAt: null,
    },
  });
  if (existing) return;

  const amount = new Prisma.Decimal(commissionCents).div(100);
  const payable = await tx.financialTransaction.create({
    data: {
      tenantId,
      type: "PAYABLE",
      status: "PENDING",
      description: `Comissao prestador ${provider.name} — OS #${order.number}`,
      category: "Comissao de prestador",
      supplier: provider.name,
      totalAmount: amount,
      paidAmount: new Prisma.Decimal(0),
      installmentsTotal: 1,
      dueDate: new Date(),
      emissionDate: new Date(),
      serviceOrderId: order.id,
      referenceType: "service_order_commission",
      referenceId: order.id,
      createdByUserId,
    },
  });

  await tx.installment.create({
    data: {
      tenantId,
      transactionId: payable.id,
      number: 1,
      amount,
      dueDate: new Date(),
      status: "PENDING",
    },
  });
}
