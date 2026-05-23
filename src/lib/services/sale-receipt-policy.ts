/**
 * Regras de impressao/envio de recibo de venda — paridade Laravel PDV
 * (versao unificada: 1 termo cobre entrega + responsabilidade quando ha
 * upgrade):
 *
 * - Sem aparelho: recibo liberado sempre apos COMPLETED
 * - Aparelho (com ou sem upgrade): precisa termo de entrega assinado
 *   (digital via Autentique OU assinatura fisica em loja). O PDF do
 *   termo ja inclui o bloco de quitacao/responsabilidade quando ha
 *   upgrade — uma unica assinatura cobre tudo.
 */
export interface SaleReceiptPolicyInput {
  status: string;
  hasDevice: boolean;
  hasUpgrade: boolean;
  // Termo de entrega: signature* na Sale (legado).
  deliveryTermSignedAt: Date | null;
  deliveryTermPhysical: boolean;
}

export interface SaleReceiptPolicyResult {
  canPrint: boolean;
  pendingReasons: string[];
  requiresDeliveryTerm: boolean;
}

export function evaluateSaleReceiptPolicy(
  s: SaleReceiptPolicyInput,
): SaleReceiptPolicyResult {
  // Venda nao finalizada nunca tem recibo.
  if (s.status !== "COMPLETED") {
    return {
      canPrint: false,
      pendingReasons: ["Venda ainda nao foi finalizada"],
      requiresDeliveryTerm: false,
    };
  }

  // Sem aparelho: sem restricoes.
  if (!s.hasDevice) {
    return {
      canPrint: true,
      pendingReasons: [],
      requiresDeliveryTerm: false,
    };
  }

  const deliverySigned = !!s.deliveryTermSignedAt || s.deliveryTermPhysical;

  const pending: string[] = [];
  if (!deliverySigned) {
    pending.push(
      s.hasUpgrade
        ? "Termo de entrega/responsabilidade pendente de assinatura"
        : "Termo de entrega pendente de assinatura",
    );
  }

  return {
    canPrint: pending.length === 0,
    pendingReasons: pending,
    requiresDeliveryTerm: true,
  };
}
