/**
 * Regras de recebimento configuráveis (D6 da auditoria de config), aplicadas
 * no PDV (`sale.finalize`). Puras/testáveis. As settings vêm de
 * `TenantReceivingSettings` — sem linha = sem regra (opt-in).
 *
 * Valores em CENTAVOS. `0` desliga a regra.
 */

export interface ReceivingRuleSettings {
  minInstallmentAmount: number;
}

export interface PaymentForRules {
  amount: number; // centavos
  installments?: number | null;
}

/**
 * Retorna o valor mínimo (centavos) violado por algum pagamento parcelado, ou
 * `null` se todos respeitam o mínimo. Considera só pagamentos com >1 parcela.
 */
export function installmentBelowMinimum(
  payments: PaymentForRules[],
  settings: ReceivingRuleSettings,
): number | null {
  if (settings.minInstallmentAmount <= 0) return null;
  for (const p of payments) {
    const n = p.installments ?? 1;
    if (n > 1 && Math.floor(p.amount / n) < settings.minInstallmentAmount) {
      return settings.minInstallmentAmount;
    }
  }
  return null;
}
