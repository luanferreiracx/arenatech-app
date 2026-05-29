/**
 * Taxas-padrao do simulador de parcelamento (exibidas ao cliente).
 *
 * Paridade Laravel `configuracoes_parcelamento` defaults: juros_2x = juros_3x =
 * 0.00, juros_4x = 1.99 e a partir dai +0.50 por parcela ate juros_36x = 17.99.
 * Sao taxas com margem embutida — superiores a taxa real do PDV.
 */
export const DEFAULT_SIMULATOR_MAX_INSTALLMENTS = 12;
export const DEFAULT_SIMULATOR_CREDIT_AVISTA_FEE = 0;
export const DEFAULT_SIMULATOR_DEBIT_FEE = 0;

export interface SimulatorTierDefault {
  installments: number;
  feePercent: number;
}

/**
 * Gera os tiers-padrao 2x..36x com a mesma escala do Laravel.
 * 2x/3x = 0, 4x = 1.99, depois +0.50 por parcela.
 */
export function defaultSimulatorTiers(): SimulatorTierDefault[] {
  const tiers: SimulatorTierDefault[] = [];
  for (let n = 2; n <= 36; n++) {
    let feePercent = 0;
    if (n >= 4) {
      // 4x -> 1.99 ; cada parcela adicional soma 0.50
      feePercent = Math.round((1.99 + (n - 4) * 0.5) * 100) / 100;
    }
    tiers.push({ installments: n, feePercent });
  }
  return tiers;
}
