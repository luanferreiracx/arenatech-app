import { Prisma } from "@prisma/client";

// `any` para suportar PrismaClient e o tx de withTenant — padrao do repo.
type TxClient = any;

type ReversalRefundInput = {
  /** userId do Provider que recebeu a comissao (sellerId da venda / technicianId|vendorId da OS). */
  providerUserId: string | null | undefined;
  /** Tipo/id do fato estornado — usado para casar com a memoria de calculo e agrupar os estornos. */
  referenceType: "sale" | "service_order";
  referenceId: string;
  /** Data do pagamento original (define em qual apuracao o fato foi comissionado). */
  factDate: Date;
  /**
   * Fracao ACUMULADA estornada (0..1) da base do fato — total ja devolvido ate
   * agora, nao so este estorno. 1 = fato inteiro devolvido. Permite varios
   * estornos parciais da mesma venda: o service reverte o DELTA que ainda falta.
   */
  cumulativeRefundedFraction: number;
  registeredById: string;
};

/**
 * Gera/complementa o ProviderReversal quando uma venda/OS comissionada e desfeita,
 * para NAO pagar comissao sobre transacao estornada (ADR 0056, épico comissoes).
 *
 * Regra (decisao do dono 2026-07-05): so age se a apuracao do mes do FATO ja
 * estiver FECHADA (CLOSED/PAID). Se ainda OPEN, o proximo `calculate` re-varre e
 * ja exclui a transacao estornada (COMPLETED→REFUNDED, ou item com total=0) —
 * criar reversal ai descontaria em dobro.
 *
 * Valor-alvo total = comissao creditada sobre o fato (lida da `memoryJson` da
 * apuracao fechada) × fracao acumulada estornada. O service cria um reversal
 * apenas pelo DELTA ainda nao revertido (soma dos reversals ja existentes para o
 * fato). Assim:
 *  - estornos parciais sucessivos somam corretamente (corrige o bug de so o 1o
 *    parcial reverter);
 *  - retry do mesmo estorno vira no-op (delta ≈ 0) — idempotente por construcao.
 *
 * O reversal e ancorado no primeiro mes com apuracao AINDA ABERTA (a partir do
 * mes corrente): senao um estorno num mes ja fechado ficaria orfao (o calculate
 * recusa recalcular mes fechado). No-op se o usuario nao e Provider, nao ha
 * apuracao fechada do fato, ou a comissao do fato foi zero.
 */
export async function createProviderReversalForRefund(
  tx: TxClient,
  tenantId: string,
  input: ReversalRefundInput,
): Promise<void> {
  if (!input.providerUserId || input.cumulativeRefundedFraction <= 0) return;

  const provider = await tx.provider.findFirst({
    where: { tenantId, userId: input.providerUserId },
    select: { id: true },
  });
  if (!provider) return;

  // Apuracao do mes do FATO: so age se ja fechada (senao o re-calculo resolve).
  const factYear = input.factDate.getFullYear();
  const factMonth = input.factDate.getMonth() + 1;
  const factApuracao = await tx.providerApuracao.findFirst({
    where: { tenantId, providerId: provider.id, year: factYear, month: factMonth },
    select: { status: true, memoryJson: true },
  });
  if (!factApuracao || factApuracao.status === "OPEN") return;

  // Comissao creditada sobre o fato (soma das linhas da memoria com este referencia_id).
  const creditedCommission = sumCommissionForReference(factApuracao.memoryJson, input.referenceId);
  if (creditedCommission <= 0) return;

  // Valor-alvo total a reverter, dado o quanto ja foi devolvido no total.
  const fraction = Math.min(1, input.cumulativeRefundedFraction);
  const targetTotal = Math.round(creditedCommission * fraction * 100) / 100;
  if (targetTotal <= 0) return;

  // Quanto ja foi revertido para este fato (soma dos reversals existentes).
  const existing = await tx.providerReversal.findMany({
    where: {
      tenantId,
      providerId: provider.id,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
    },
    select: { amount: true },
  });
  const alreadyReversed = existing.reduce(
    (sum: number, r: { amount: Prisma.Decimal }) => sum + Number(r.amount),
    0,
  );

  const delta = Math.round((targetTotal - alreadyReversed) * 100) / 100;
  if (delta <= 0) return; // retry ou nada novo a reverter — idempotente.

  // Ancora o reversal no primeiro mes com apuracao AINDA ABERTA (a partir do mes
  // corrente). O reversal so roda quando a apuracao do FATO ja esta fechada (guard
  // acima), e o anchor sempre pula meses fechados — logo o reversal cai sempre num
  // mes >= corrente e != mes do fato: e sempre uma devolucao de mes posterior.
  const factDate = await resolveOpenMonthAnchor(tx, tenantId, provider.id);

  await tx.providerReversal.create({
    data: {
      tenantId,
      providerId: provider.id,
      factDate,
      type: "RETURN_LATER_MONTH",
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      amount: new Prisma.Decimal(delta),
      description:
        input.referenceType === "sale"
          ? "Estorno automatico — venda estornada"
          : "Estorno automatico — OS estornada",
      registeredById: input.registeredById,
    },
  });
}

/**
 * Primeira data (dia 1) de um mes cuja apuracao do prestador ainda NAO esta
 * fechada — a partir do mes corrente, andando pra frente. Garante que o reversal
 * caia num mes que o `calculate` ainda vai processar. Limite de guarda de 24
 * meses (nunca deveria haver tantos meses fechados no futuro).
 */
async function resolveOpenMonthAnchor(
  tx: TxClient,
  tenantId: string,
  providerId: string,
): Promise<Date> {
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth() + 1;

  for (let i = 0; i < 24; i++) {
    const apuracao = await tx.providerApuracao.findFirst({
      where: { tenantId, providerId, year, month },
      select: { status: true },
    });
    // Sem apuracao ou aberta → o calculate deste mes vai considerar o reversal.
    if (!apuracao || apuracao.status === "OPEN") {
      // Dia 1 do mes as 12:00 (meio-dia) — dentro do range [start, end] do mes.
      return new Date(year, month - 1, 1, 12, 0, 0, 0);
    }
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  // Fallback improvavel: usa agora (24 meses futuros todos fechados).
  return now;
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
