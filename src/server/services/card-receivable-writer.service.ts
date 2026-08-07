import { Prisma } from "@prisma/client";
import { logger } from "@/lib/logger";
import { splitCardReceivable, resolveAcquirerRate } from "@/server/services/card-receivable.service";

/** Cliente Prisma mínimo necessário (transação). */
type ReceivableTx = {
  acquirerRate: {
    findFirst: (args: object) => Promise<{
      feePercent: Prisma.Decimal;
      feeFixed: Prisma.Decimal;
      settlementDays: number;
    } | null>;
  };
  acquirer: {
    findFirst: (args: object) => Promise<{ id: string; receivingAccountId: string | null } | null>;
  };
  cardReceivable: {
    createMany: (args: { data: Prisma.CardReceivableCreateManyInput[] }) => Promise<unknown>;
  };
};

export interface CardPaymentForReceivable {
  acquirerId: string;
  cardBrandId: string;
  cardKind: "CREDIT" | "DEBIT";
  /** Valor bruto desta forma de pagamento (centavos). */
  grossCents: number;
  installments: number;
}

export interface GenerateCardReceivablesParams {
  tenantId: string;
  saleId?: string | null;
  serviceOrderId?: string | null;
  payment: CardPaymentForReceivable;
  createdByUserId: string;
  saleDate?: Date;
}

/**
 * Gera os CardReceivable de um pagamento no cartão: resolve a AcquirerRate
 * (adquirente×bandeira×tipo×parcela) do tenant, divide em 1 recebível por
 * parcela (líquido/D+N por parcela) e persiste, vinculando à conta de depósito
 * da adquirente.
 *
 * Retorna o nº de recebíveis criados. Se não houver taxa cadastrada para a
 * combinação, retorna 0 (venda segue sem recebível — fallback ao comportamento
 * atual; não bloqueia a finalização).
 */
export async function generateCardReceivables(
  tx: ReceivableTx,
  params: GenerateCardReceivablesParams,
): Promise<number> {
  const { tenantId, saleId, serviceOrderId, payment, createdByUserId } = params;
  const saleDate = params.saleDate ?? new Date();

  // Defesa em profundidade: adquirente precisa ser do tenant (além do RLS).
  const acquirer = await tx.acquirer.findFirst({
    where: { id: payment.acquirerId, tenantId },
    select: { id: true, receivingAccountId: true },
  });
  if (!acquirer) {
    // Não bloqueia a venda (decisão de projeto), mas NÃO pode ser silencioso:
    // sem recebível, o dinheiro que a loja tem a receber some do sistema.
    // Auditoria 2026-08-07, E8-2.
    logger.error("Venda no cartao sem recebivel: adquirente nao encontrado no tenant", {
      tenantId,
      acquirerId: payment.acquirerId,
      saleId: saleId ?? null,
      serviceOrderId: serviceOrderId ?? null,
      grossCents: payment.grossCents,
    });
    return 0;
  }

  // Mesma resolucao de taxa do breakdown da venda (resolveAcquirerRate) — fonte
  // unica, sem drift entre o que entra no DRE e o que vira recebivel.
  const rate = await resolveAcquirerRate(tx, tenantId, {
    acquirerId: payment.acquirerId,
    cardBrandId: payment.cardBrandId,
    kind: payment.cardKind,
    installments: payment.installments,
  });
  if (!rate) {
    // O caso REAL: adquirente ativo sem AcquirerRate cadastrada para a
    // combinação (bandeira × tipo × parcelas). Medido em produção: o
    // adquirente `stone` do tenant `pdv-09ed1f82` está ATIVO com ZERO taxas —
    // a primeira venda no cartão dele cairia aqui e sumiria em silêncio.
    logger.error("Venda no cartao sem recebivel: taxa da adquirente nao cadastrada", {
      tenantId,
      acquirerId: payment.acquirerId,
      cardBrandId: payment.cardBrandId,
      cardKind: payment.cardKind,
      installments: payment.installments,
      saleId: saleId ?? null,
      serviceOrderId: serviceOrderId ?? null,
      grossCents: payment.grossCents,
    });
    return 0;
  }

  const splits = splitCardReceivable(rate, payment.grossCents, payment.installments, saleDate);

  await tx.cardReceivable.createMany({
    data: splits.map((s) => ({
      tenantId,
      saleId: saleId ?? null,
      serviceOrderId: serviceOrderId ?? null,
      acquirerId: payment.acquirerId,
      cardBrandId: payment.cardBrandId,
      kind: payment.cardKind,
      installmentNumber: s.installmentNumber,
      installmentsTotal: s.installmentsTotal,
      grossAmount: new Prisma.Decimal(s.grossCents / 100),
      feeAmount: new Prisma.Decimal(s.feeCents / 100),
      netAmount: new Prisma.Decimal(s.netCents / 100),
      expectedSettlementDate: s.settlementDate,
      receivingAccountId: acquirer.receivingAccountId,
      status: "PENDING" as const,
      createdByUserId,
    })),
  });

  return splits.length;
}
