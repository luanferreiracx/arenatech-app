/**
 * Projeção de fluxo de caixa (Fase 1 da migração de recebível de cartão para
 * fonte única — auditoria PDV R4).
 *
 * PROBLEMA CORRIGIDO: uma venda no cartão parcelado gera DUAS representações do
 * mesmo dinheiro — `Installment` (FinancialTransaction, vencimento mensal) E
 * `CardReceivable` (D+N real, líquido). O `projectedCashFlow` somava as duas,
 * inflando ~2× o recebível de cartão parcelado.
 *
 * FONTE ÚNICA: o dinheiro de cartão em trânsito entra pelo `CardReceivable`
 * (D+N real, líquido). As parcelas de vendas que TÊM CardReceivable (cartão)
 * são puladas aqui — senão contariam duas vezes. Função pura/testável.
 */

export interface ProjectionInstallment {
  dueDate: Date;
  /** Saldo a receber/pagar da parcela (amount - paidAmount), em centavos. */
  remainingCents: number;
  type: "RECEIVABLE" | "PAYABLE";
  /** Venda de origem (quando a transação é de venda). */
  saleId: string | null;
  /**
   * D1 (auditoria fin 2026-07-10): a parcela é de um pagamento em CARTÃO?
   * Pós-#478 cartão não gera FT/parcela; só FT de cartão LEGADO tem método
   * cartao_*. A dedup só deve pular a parcela de cartão legado (que é o double
   * do CardReceivable) — NÃO a parcela de crediário de uma venda MISTA
   * (crediário + cartão), que é dinheiro legítimo sem representação em cartão.
   */
  isCardMethod: boolean;
}

export interface ProjectionCardReceivable {
  expectedSettlementDate: Date;
  /** Líquido que cai na conta (já descontada a taxa), em centavos. */
  netCents: number;
}

export interface ProjectionDay {
  date: string;
  receivable: number;
  payable: number;
  dayBalance: number;
  cumulativeBalance: number;
}

export interface ProjectedCashFlow {
  projection: ProjectionDay[];
  summary: { totalReceivable: number; totalPayable: number; projectedBalance: number };
}

/** Chave diária (YYYY-MM-DD) a partir de uma data. */
function dayKey(date: Date): string {
  return date.toISOString().split("T")[0]!;
}

/**
 * Monta a projeção diária de fluxo de caixa a partir das parcelas
 * (FinancialTransaction) e dos recebíveis de cartão, deduplicando o cartão.
 *
 * @param installments parcelas PENDING/OVERDUE no período
 * @param cardReceivables recebíveis de cartão PENDING no período (líquido, D+N)
 * @param cardSaleIds ids de vendas que TÊM CardReceivable — suas parcelas são
 *   puladas (o dinheiro entra pelo CardReceivable, fonte única)
 */
export function buildProjectedCashFlow(
  installments: ProjectionInstallment[],
  cardReceivables: ProjectionCardReceivable[],
  cardSaleIds: ReadonlySet<string>,
): ProjectedCashFlow {
  const daily: Record<string, { receivable: number; payable: number }> = {};
  const bucket = (key: string) => (daily[key] ??= { receivable: 0, payable: 0 });

  for (const inst of installments) {
    // Cartão legado: o dinheiro entra pelo CardReceivable (fonte única). Pula só
    // a parcela de MÉTODO cartão de uma venda que TEM CardReceivable — evita a
    // dupla contagem sem derrubar a parcela de crediário de uma venda mista
    // (crediário + cartão), que não tem representação em CardReceivable (D1).
    if (inst.saleId && inst.isCardMethod && cardSaleIds.has(inst.saleId)) continue;
    const b = bucket(dayKey(inst.dueDate));
    if (inst.type === "RECEIVABLE") b.receivable += inst.remainingCents;
    else b.payable += inst.remainingCents;
  }

  for (const cr of cardReceivables) {
    bucket(dayKey(cr.expectedSettlementDate)).receivable += cr.netCents;
  }

  let cumulativeBalance = 0;
  const projection: ProjectionDay[] = Object.entries(daily)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, data]) => {
      const dayBalance = data.receivable - data.payable;
      cumulativeBalance += dayBalance;
      return { date, receivable: data.receivable, payable: data.payable, dayBalance, cumulativeBalance };
    });

  const totalReceivable = projection.reduce((s, p) => s + p.receivable, 0);
  const totalPayable = projection.reduce((s, p) => s + p.payable, 0);

  return {
    projection,
    summary: { totalReceivable, totalPayable, projectedBalance: totalReceivable - totalPayable },
  };
}
