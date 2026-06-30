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
 * `CardReceivable` da venda (DRE = recebivel). Sem AcquirerRate cadastrada, cai
 * pro fallback `PaymentMethod.feePercent/feeFixed` (mesma matematica). A
 * politica (quem paga a taxa) vem de `PaymentMethod.feePolicy`.
 *
 * Politicas:
 * - LOJA_ABSORVE: cliente paga `valorMercadoria`, loja deduz taxa do recebido.
 *   netRevenue = valorMercadoria - taxa
 * - CLIENTE_PAGA: cliente paga acrescimo (gross-up sobre o valor que passa na
 *   maquininha). A taxa incide sobre o TOTAL com acrescimo; loja recebe o
 *   liquido desse total.
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
   * Valor total que o cliente paga (centavos). Se informado e > valorMercadoria,
   * usado direto. Caso contrario, calcula gross-up (politica CLIENTE_PAGA).
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
  const policy: PaymentFeePolicy =
    (method.feePolicy as PaymentFeePolicy | undefined) ?? "LOJA_ABSORVE";
  const base = emptyBreakdown(valorMercadoria, policy);

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

  if (policy === "CLIENTE_PAGA") {
    // Cliente paga o acrescimo. O valor que passa na maquininha (totalPaid) e o
    // bruto sobre o qual a taxa incide — e o MESMO bruto do recebivel.
    let totalPaid: number;
    if (totalPaidManual != null && totalPaidManual >= valorMercadoria) {
      totalPaid = totalPaidManual;
    } else {
      // Gross-up: bruto = (mercadoria + taxaFixa) / (1 - taxa%/100)
      const denom = 100 - rate.feePercent;
      if (denom <= 0) {
        base.error = `Taxa percentual invalida (${rate.feePercent}%): impossivel calcular gross-up.`;
        return base;
      }
      totalPaid = Math.round(((valorMercadoria + rate.feeFixed) * 100) / denom);
    }
    // Taxa da operadora sobre o TOTAL com acrescimo, com a matematica do recebivel.
    const operatorFee = totalCardFeeCents(rate, totalPaid, installments, saleDate);
    base.totalPaid = totalPaid;
    base.surcharge = Math.max(0, totalPaid - valorMercadoria);
    base.operatorFee = operatorFee;
    base.netRevenue = totalPaid - operatorFee;
  } else {
    // LOJA_ABSORVE: cliente paga a mercadoria; a loja deduz a taxa. operatorFee
    // com a MESMA matematica do recebivel (split por parcela).
    const operatorFee = totalCardFeeCents(rate, valorMercadoria, installments, saleDate);
    // Se o operador informou um totalPaidManual MAIOR (maquininha passou o
    // acrescimo direto ao cliente), preserva o excedente como surcharge pra
    // refletir o que o cliente REALMENTE pagou.
    const totalPaid =
      totalPaidManual != null && totalPaidManual > valorMercadoria
        ? totalPaidManual
        : valorMercadoria;
    base.surcharge = totalPaid - valorMercadoria;
    base.totalPaid = totalPaid;
    base.operatorFee = operatorFee;
    base.netRevenue = valorMercadoria - operatorFee;
  }

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
