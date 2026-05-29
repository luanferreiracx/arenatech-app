import { Prisma } from "@prisma/client";

// `any` para suportar PrismaClient e o tx de withTenant — padrao do repo.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TxClient = any;

/**
 * Cria a comissao automatica do tecnico ao finalizar o pagamento de uma OS.
 *
 * Procura CommissionRule(type=SERVICE_ORDER, role=technician, active) e cria
 * Commission(status=PENDING). Idempotente: nao duplica se ja existe Commission
 * nao-cancelada para a OS. Usado pelos DOIS caminhos de pagamento — registerPayment
 * (garantia/cortesia) e o finalize do PDV — para que a comissao seja gerada
 * independentemente de como a OS foi paga.
 */
export async function createOsTechnicianCommission(
  tx: TxClient,
  tenantId: string,
  order: { id: string; number: string; technicianId: string | null },
  baseAmountCents: number,
): Promise<void> {
  if (!order.technicianId || baseAmountCents <= 0) return;

  const existing = await tx.commission.findFirst({
    where: {
      referenceType: "SERVICE_ORDER",
      referenceId: order.id,
      status: { not: "CANCELLED" },
    },
  });
  if (existing) return;

  const rule = await tx.commissionRule.findFirst({
    where: { tenantId, type: "SERVICE_ORDER", role: "technician", active: true },
  });
  if (!rule) return;

  const ratePercent = Number(rule.ratePercent);
  const variable = Math.round(baseAmountCents * (ratePercent / 100));
  const fixed = rule.fixedAmount ? Math.round(Number(rule.fixedAmount) * 100) : 0;
  const totalCommission = variable + fixed;
  if (totalCommission <= 0) return;

  const now = new Date();
  await tx.commission.create({
    data: {
      tenantId,
      userId: order.technicianId,
      ruleId: rule.id,
      type: "SERVICE_ORDER",
      status: "PENDING",
      referenceId: order.id,
      referenceType: "SERVICE_ORDER",
      referenceNumber: order.number,
      baseAmount: new Prisma.Decimal(baseAmountCents / 100),
      ratePercent: rule.ratePercent,
      commissionAmount: new Prisma.Decimal(totalCommission / 100),
      periodMonth: now.getMonth() + 1,
      periodYear: now.getFullYear(),
      notes: `Comissao automatica do pagamento da OS ${order.number}`,
    },
  });
}
