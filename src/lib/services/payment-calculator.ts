/**
 * Calculadora central de pagamentos da venda.
 *
 * Paridade Laravel CalculadoraPagamentoService.
 *
 * Dado (paymentMethod, parcelas, valorMercadoria, tipoVenda), retorna um
 * breakdown com taxa da operadora, valor que o cliente paga e receita
 * liquida da loja.
 *
 * Politicas:
 * - LOJA_ABSORVE: cliente paga `valorMercadoria`, loja deduz taxa do recebido.
 *   netRevenue = valorMercadoria - taxa
 * - CLIENTE_PAGA: cliente paga acrescimo. Se o operador informou um
 *   `valorTotalPagoManual` maior que `valorMercadoria`, infere o acrescimo
 *   direto. Sem valor manual, usa gross-up.
 *   netRevenue = valorMercadoria (a operadora fica com o acrescimo)
 */

import { Prisma, type PaymentMethod, type PaymentMethodRate } from "@prisma/client";

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

interface CalculatePaymentInput {
  /** PaymentMethod + rates resolvidos. */
  method: PaymentMethod & { rates?: PaymentMethodRate[] };
  installments: number;
  /** Valor da mercadoria em centavos. */
  valorMercadoria: number;
  /** Tipo da venda (paridade tipo_venda Laravel). */
  appliesTo: PaymentApplyTo;
  /**
   * Valor total que o cliente paga (centavos). Se informado e > valorMercadoria,
   * usado direto. Caso contrario, calcula gross-up.
   */
  totalPaidManual?: number | null;
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

/**
 * Resolve a `PaymentMethodRate` aplicavel para (parcelas, tipo de venda).
 * Ordem de fallback: rate exato (installments + appliesTo) -> rate AMBOS para
 * mesmas parcelas -> fallback para feePercent/feeFixed do PaymentMethod.
 */
function resolveRate(
  method: PaymentMethod & { rates?: PaymentMethodRate[] },
  installments: number,
  appliesTo: PaymentApplyTo,
): PaymentMethodRate | null {
  const rates = (method.rates ?? []).filter((r) => r.active && r.installments === installments);
  return (
    rates.find((r) => r.appliesTo === appliesTo)
    ?? rates.find((r) => r.appliesTo === "AMBOS")
    ?? null
  );
}

export function calculatePayment(input: CalculatePaymentInput): PaymentBreakdown {
  const { method, installments, valorMercadoria, appliesTo, totalPaidManual } = input;
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

  const rate = resolveRate(method, installments, appliesTo);
  const feePercent = rate ? Number(rate.feePercent) : Number(method.feePercent);
  const feeFixedReais = rate ? Number(rate.feeFixed) : Number(method.feeFixed);
  const policy: PaymentFeePolicy = (rate?.policy as PaymentFeePolicy | undefined) ?? "LOJA_ABSORVE";
  const settlementDays = rate?.settlementDays ?? method.settlementDays ?? 0;

  base.feePercent = feePercent;
  base.feeFixed = Math.round(feeFixedReais * 100);
  base.policy = policy;
  base.settlementDays = settlementDays;

  if (policy === "CLIENTE_PAGA") {
    let totalPaid: number;
    if (totalPaidManual != null && totalPaidManual >= valorMercadoria) {
      // Operador digitou o valor que aparece na maquininha — usa direto.
      totalPaid = totalPaidManual;
    } else {
      // Gross-up: bruto = (mercadoria + taxaFixa) / (1 - taxa%/100)
      const denom = 100 - feePercent;
      if (denom <= 0) {
        base.error = `Taxa percentual invalida (${feePercent}%): impossivel calcular gross-up.`;
        return base;
      }
      totalPaid = Math.round(((valorMercadoria + base.feeFixed) * 100) / denom);
    }
    const surcharge = Math.max(0, totalPaid - valorMercadoria);
    base.surcharge = surcharge;
    base.totalPaid = totalPaid;
    // Operadora fica com o acrescimo; loja recebe o valor de mercadoria.
    base.operatorFee = surcharge;
    base.netRevenue = valorMercadoria;
  } else {
    // LOJA_ABSORVE: cliente paga preço normal; loja deduz taxa do recebido.
    const fee = Math.round((valorMercadoria * feePercent) / 100) + base.feeFixed;
    base.surcharge = 0;
    base.totalPaid = valorMercadoria;
    base.operatorFee = fee;
    base.netRevenue = valorMercadoria - fee;
  }

  base.installmentValue = installments > 0
    ? Math.round(base.totalPaid / installments)
    : base.totalPaid;

  return base;
}

/**
 * Helper para usar dentro de transacoes Prisma: busca PaymentMethod+rates
 * e calcula.
 */
export async function calculatePaymentByMethodId(
  tx: { paymentMethod: { findUnique: (args: { where: { id: string }; include?: { rates: boolean } }) => Promise<(PaymentMethod & { rates?: PaymentMethodRate[] }) | null> } },
  opts: {
    paymentMethodId: string;
    installments: number;
    valorMercadoria: number;
    appliesTo: PaymentApplyTo;
    totalPaidManual?: number | null;
  },
): Promise<PaymentBreakdown> {
  const method = await tx.paymentMethod.findUnique({
    where: { id: opts.paymentMethodId },
    include: { rates: true },
  });
  if (!method) {
    return {
      ...emptyBreakdown(opts.valorMercadoria),
      error: "Forma de pagamento nao encontrada.",
    };
  }
  return calculatePayment({
    method,
    installments: opts.installments,
    valorMercadoria: opts.valorMercadoria,
    appliesTo: opts.appliesTo,
    totalPaidManual: opts.totalPaidManual,
  });
}

// Forca uso explicito de Prisma para evitar unused import warnings
export const _PrismaDecimal = Prisma.Decimal;
