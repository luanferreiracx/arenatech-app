/**
 * Calculadora central de pagamentos da venda.
 *
 * Paridade Laravel CalculadoraPagamentoService.
 *
 * Dado (paymentMethod, parcelas, valorMercadoria, adquirente/bandeira/tipo),
 * retorna um breakdown com taxa da operadora, valor que o cliente paga e
 * receita liquida da loja.
 *
 * FONTE DA TAXA (unificacao): a taxa do cartao vem da `AcquirerRate`
 * (adquirente x bandeira x tipo x parcela) e e calculada com a MESMA funcao do
 * recebivel (`totalCardFeeCents` -> `splitCardReceivable`), pra que o
 * `operatorFee` do breakdown bata centavo a centavo com a soma dos
 * `CardReceivable` da venda (DRE = recebivel). Cartao (adquirente/bandeira/tipo
 * informados) SEM taxa cadastrada pra combinacao e ERRO (R3) — nao cai mais no
 * fallback silencioso. O fallback `PaymentMethod.feePercent/feeFixed` vale so
 * pra NAO-cartao (dinheiro/PIX = taxa 0).
 *
 * QUEM PAGA A TAXA — DECIDIDO NA VENDA, nao configurado: o operador informa no
 * PDV o valor que o cliente pagou de fato (`totalPaidManual`, o que passou na
 * maquininha). A regra e UNICA, sem ramo por politica:
 *   - `totalPaid` = o que o cliente pagou (>= valorMercadoria; default =
 *     valorMercadoria quando o operador nao informa = loja absorve).
 *   - taxa incide sobre `totalPaid` (o bruto real da maquininha).
 *   - netRevenue = totalPaid - operatorFee.
 *   - surcharge = totalPaid - valorMercadoria (>0 = cliente pagou o acrescimo).
 * A "politica" no output e DERIVADA (surcharge>0 -> CLIENTE_PAGA) so pra rotular
 * o recibo; nao e mais uma escolha de configuracao.
 */

import { Prisma, type PaymentMethod } from "@prisma/client";
import {
  totalCardFeeCents,
  resolveAcquirerRate,
  type CardSettlementRate,
} from "@/server/services/card-receivable.service";

export type PaymentApplyTo = "APARELHO" | "NAO_APARELHO" | "AMBOS";
export type PaymentFeePolicy = "LOJA_ABSORVE" | "CLIENTE_PAGA";

export interface PaymentBreakdown {
  valorMercadoria: number;       // centavos
  feePercent: number;            // % da operadora
  feeFixed: number;              // centavos
  policy: PaymentFeePolicy;
  /** Acrescimo cobrado do cliente (politica CLIENTE_PAGA). 0 quando LOJA_ABSORVE. */
  surcharge: number;             // centavos
  /** Valor total pago pelo cliente (mercadoria + acrescimo se cliente_paga). */
  totalPaid: number;             // centavos
  /** Valor de cada parcela. */
  installmentValue: number;      // centavos
  /** Taxa que a operadora cobra (loja absorve OU acrescimo). */
  operatorFee: number;           // centavos
  /** Receita liquida da loja (entra no DRE). */
  netRevenue: number;            // centavos
  settlementDays: number;
  error: string | null;
}

/** Dados do cartao (adquirente/bandeira/tipo) pra resolver a taxa. */
export interface CardRateInput {
  acquirerId: string;
  cardBrandId: string;
  cardKind: "CREDIT" | "DEBIT";
}

interface CalculatePaymentInput {
  method: PaymentMethod;
  installments: number;
  /** Valor da mercadoria em centavos. */
  valorMercadoria: number;
  /**
   * Taxa do cartao ja resolvida (AcquirerRate em centavos) ou null. Quando null,
   * usa a taxa-base do PaymentMethod (fallback). Cartao sem adquirente
   * selecionado: null -> fallback base (e o recebivel nao e gerado).
   */
  cardRate: CardSettlementRate | null;
  /**
   * Valor total que o cliente pagou DE FATO (centavos) — o que passou na
   * maquininha. Se informado e > valorMercadoria, o cliente pagou o acrescimo;
   * se ausente (ou == mercadoria), a loja absorve a taxa.
   */
  totalPaidManual?: number | null;
  /** Data da venda — base do D+N (so afeta settlementDays, nao a taxa). */
  saleDate?: Date;
}

function emptyBreakdown(valorMercadoria: number, policy: PaymentFeePolicy = "LOJA_ABSORVE"): PaymentBreakdown {
  return {
    valorMercadoria,
    feePercent: 0,
    feeFixed: 0,
    policy,
    surcharge: 0,
    totalPaid: valorMercadoria,
    installmentValue: valorMercadoria,
    operatorFee: 0,
    netRevenue: valorMercadoria,
    settlementDays: 0,
    error: null,
  };
}

/** Taxa-base do PaymentMethod (fallback quando nao ha AcquirerRate). */
function baseRateFromMethod(method: PaymentMethod): CardSettlementRate {
  return {
    feePercent: Number(method.feePercent),
    feeFixed: Math.round(Number(method.feeFixed) * 100), // reais → centavos
    settlementDays: method.settlementDays ?? 0,
  };
}

export function calculatePayment(input: CalculatePaymentInput): PaymentBreakdown {
  const { method, installments, valorMercadoria, cardRate, totalPaidManual } = input;
  const saleDate = input.saleDate ?? new Date();
  const base = emptyBreakdown(valorMercadoria);

  if (valorMercadoria < 0) {
    base.error = "Valor da mercadoria nao pode ser negativo.";
    return base;
  }
  if (installments < 1) {
    base.error = "Parcelas deve ser >= 1.";
    return base;
  }
  if (!method.acceptsInstallments && installments > 1) {
    base.error = `${method.name} nao aceita parcelamento.`;
    return base;
  }
  if (installments > method.installmentsMax) {
    base.error = `${method.name} aceita no maximo ${method.installmentsMax}x.`;
    return base;
  }
  if (method.acceptsInstallments && installments < method.installmentsMin) {
    base.error = `${method.name} exige no minimo ${method.installmentsMin}x.`;
    return base;
  }

  // Taxa: AcquirerRate (fonte unica) ou fallback base do PaymentMethod.
  const rate = cardRate ?? baseRateFromMethod(method);
  if (rate.feePercent < 0 || rate.feeFixed < 0) {
    base.error = `Taxa invalida (${rate.feePercent}% + ${rate.feeFixed}c): valor negativo.`;
    return base;
  }

  base.feePercent = rate.feePercent;
  base.feeFixed = rate.feeFixed;
  base.settlementDays = rate.settlementDays;

  // REGRA UNICA (quem paga a taxa = decidido na venda, nao configurado):
  // `totalPaid` = o que o cliente pagou de fato. Sem valor informado (ou igual a
  // mercadoria) => loja absorve. Maior que a mercadoria => cliente pagou o
  // acrescimo. A taxa SEMPRE incide sobre o totalPaid (bruto real da maquininha),
  // que e o MESMO bruto do recebivel -> operatorFee == Σ feeCents (DRE = recebivel).
  const totalPaid =
    totalPaidManual != null && totalPaidManual > valorMercadoria
      ? totalPaidManual
      : valorMercadoria;
  const operatorFee = totalCardFeeCents(rate, totalPaid, installments, saleDate);

  base.totalPaid = totalPaid;
  base.surcharge = totalPaid - valorMercadoria;
  base.operatorFee = operatorFee;
  base.netRevenue = totalPaid - operatorFee;
  // Politica DERIVADA (so pra rotular o recibo): cliente pagou o acrescimo?
  base.policy = base.surcharge > 0 ? "CLIENTE_PAGA" : "LOJA_ABSORVE";

  base.installmentValue =
    installments > 0 ? Math.round(base.totalPaid / installments) : base.totalPaid;

  return base;
}

interface CalculatorTx {
  paymentMethod: {
    findUnique: (args: { where: { id: string } }) => Promise<PaymentMethod | null>;
  };
  acquirerRate: {
    findFirst: (args: object) => Promise<{
      feePercent: { toString(): string } | number;
      feeFixed: { toString(): string } | number;
      settlementDays: number;
    } | null>;
  };
}

/**
 * Helper para usar dentro de transacoes Prisma: busca o PaymentMethod (validacao
 * + politica), resolve a AcquirerRate (taxa do cartao) quando ha
 * adquirente/bandeira/tipo, e calcula o breakdown.
 */
export async function calculatePaymentByMethodId(
  tx: CalculatorTx,
  opts: {
    paymentMethodId: string;
    installments: number;
    valorMercadoria: number;
    /** Cartao: adquirente/bandeira/tipo (quando informados, resolve AcquirerRate). */
    card?: CardRateInput | null;
    totalPaidManual?: number | null;
    /** tenantId pra resolver a AcquirerRate (defesa em profundidade + RLS). */
    tenantId: string;
    saleDate?: Date;
  },
): Promise<PaymentBreakdown> {
  const method = await tx.paymentMethod.findUnique({
    where: { id: opts.paymentMethodId },
  });
  if (!method) {
    return {
      ...emptyBreakdown(opts.valorMercadoria),
      error: "Forma de pagamento nao encontrada.",
    };
  }

  // Resolve a taxa do cartao SO quando ha adquirente/bandeira/tipo. Sem isso
  // (cartao sem maquininha selecionada, ou dinheiro/PIX), cardRate = null e o
  // calculo usa a taxa-base do metodo (0 pra dinheiro/PIX).
  const cardRate = opts.card
    ? await resolveAcquirerRate(tx, opts.tenantId, {
        acquirerId: opts.card.acquirerId,
        cardBrandId: opts.card.cardBrandId,
        kind: opts.card.cardKind,
        installments: opts.installments,
      })
    : null;

  // R3 (auditoria PDV): cartao COM adquirente/bandeira informados mas SEM taxa
  // cadastrada pra combinacao (adquirente×bandeira×tipo×parcela) e ERRO — nao cai
  // mais silenciosamente na taxa-base do metodo (fee errado + quebra da invariante
  // DRE = recebivel, ja que o CardReceivable nao seria gerado). O finalize lanca;
  // o preview (previewPaymentBreakdown) exibe.
  if (opts.card && !cardRate) {
    return {
      ...emptyBreakdown(opts.valorMercadoria),
      error:
        "Nao ha taxa cadastrada para esta bandeira/parcelas nesta maquininha. Cadastre em Cartoes e Recebimento.",
    };
  }

  return calculatePayment({
    method,
    installments: opts.installments,
    valorMercadoria: opts.valorMercadoria,
    cardRate,
    totalPaidManual: opts.totalPaidManual,
    saleDate: opts.saleDate,
  });
}

// Forca uso explicito de Prisma para evitar unused import warnings
export const _PrismaDecimal = Prisma.Decimal;
