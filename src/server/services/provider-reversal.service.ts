import { Prisma } from "@prisma/client";

// `any` para suportar PrismaClient e o tx de withTenant — padrao do repo.
type TxClient = any;

type ReversalRefundInput = {
  /** userId do Provider que recebeu a comissao (sellerId da venda / technicianId|vendorId da OS). */
  providerUserId: string | null | undefined;
  /** Tipo/id do fato estornado — usado para casar com a memoria de calculo e para idempotencia. */
  referenceType: "sale" | "service_order";
  referenceId: string;
  /** Data do pagamento original (define em qual apuracao o fato foi comissionado). */
  factDate: Date;
  /**
   * Fracao estornada (0..1) da base do fato. 1 = estorno total. Para estorno
   * parcial de venda, e a razao (LBC estornada / LBC total do fato). A comissao
   * revertida e proporcional a essa fracao.
   */
  refundedFraction: number;
  registeredById: string;
};

/**
 * Gera um ProviderReversal quando uma venda/OS comissionada e desfeita, para
 * NAO pagar comissao sobre transacao estornada (ADR 0056, épico comissoes).
 *
 * Regra (decisao do dono 2026-07-05): so cria reversal se a apuracao do mes do
 * FATO ja estiver FECHADA (CLOSED/PAID). Se ainda OPEN, o proximo `calculate`
 * re-varre as vendas/OS e ja exclui a transacao estornada (COMPLETED→REFUNDED,
 * ou item com total=0) — criar reversal ai descontaria em dobro.
 *
 * Valor revertido = a comissao efetivamente creditada sobre o fato (lida da
 * `memoryJson` da apuracao fechada) × fracao estornada. Isso casa o estorno com
 * o que foi pago, mesmo com faixas progressivas.
 *
 * Idempotente: nao duplica reversal para o mesmo (referenceType, referenceId).
 * No-op se o usuario nao e Provider, ou nao ha apuracao fechada, ou a comissao
 * do fato foi zero.
 */
export async function createProviderReversalForRefund(
  tx: TxClient,
  tenantId: string,
  input: ReversalRefundInput,
): Promise<void> {
  if (!input.providerUserId || input.refundedFraction <= 0) return;

  const provider = await tx.provider.findFirst({
    where: { tenantId, userId: input.providerUserId },
    select: { id: true },
  });
  if (!provider) return;

  // Idempotencia: um reversal por fato estornado.
  const existing = await tx.providerReversal.findFirst({
    where: {
      tenantId,
      providerId: provider.id,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
    },
    select: { id: true },
  });
  if (existing) return;

  // Apuracao do mes do fato: so age se ja fechada (senao o re-calculo resolve).
  const year = input.factDate.getFullYear();
  const month = input.factDate.getMonth() + 1;
  const apuracao = await tx.providerApuracao.findFirst({
    where: { tenantId, providerId: provider.id, year, month },
    select: { status: true, memoryJson: true },
  });
  if (!apuracao || apuracao.status === "OPEN") return;

  // Comissao creditada sobre o fato: soma as linhas da memoria com este referencia_id.
  const creditedCommission = sumCommissionForReference(apuracao.memoryJson, input.referenceId);
  if (creditedCommission <= 0) return;

  const reversedAmount = Math.round(creditedCommission * input.refundedFraction * 100) / 100;
  if (reversedAmount <= 0) return;

  // Tipo: devolucao no mesmo mes do fato vs mes posterior (o fato ja estava numa
  // apuracao fechada; o estorno cai no mes corrente como ajuste).
  const now = new Date();
  const sameMonth = now.getFullYear() === year && now.getMonth() + 1 === month;
  const reversalType = sameMonth ? "RETURN_SAME_MONTH" : "RETURN_LATER_MONTH";

  await tx.providerReversal.create({
    data: {
      tenantId,
      providerId: provider.id,
      factDate: now,
      type: reversalType,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      amount: new Prisma.Decimal(reversedAmount),
      description:
        input.referenceType === "sale"
          ? "Estorno automatico — venda estornada"
          : "Estorno automatico — OS estornada",
      registeredById: input.registeredById,
    },
  });
}

/**
 * Soma a comissao (`comissao`) de todas as linhas da memoria de calculo cujo
 * `referencia_id` casa com o fato. Tolerante a memoria ausente/mal-formada.
 */
function sumCommissionForReference(memoryJson: unknown, referenceId: string): number {
  if (!memoryJson || typeof memoryJson !== "object") return 0;
  const linhas = (memoryJson as { linhas?: unknown }).linhas;
  if (!Array.isArray(linhas)) return 0;

  let total = 0;
  for (const linha of linhas) {
    if (!linha || typeof linha !== "object") continue;
    const row = linha as { referencia_id?: unknown; comissao?: unknown };
    if (row.referencia_id !== referenceId) continue;
    const comissao = typeof row.comissao === "number" ? row.comissao : Number(row.comissao);
    if (Number.isFinite(comissao)) total += comissao;
  }
  return Math.round(total * 100) / 100;
}
