/**
 * Calculo PURO das taxas DePix (sem side effects). Centavos in/out — sempre
 * inteiro pra evitar floating point em dinheiro.
 *
 * Modelo Arena Tech (taxa cobrada do tenant):
 *   - Entrada (deposito): R$ entryFeeFixed + entryFeePercent% sobre o bruto
 *   - Saida  (saque):     R$ exitFeeFixed  + exitFeePercent%  sobre o bruto
 *
 * Empilha sobre a taxa do provedor. UI mostra breakdown transparente.
 *
 * DEPOSITO: Eulen cobra R$ 0,99 fixo sobre o valor pago pelo cliente.
 *
 * SAQUE: Eulen cobra 1% fixo. Ela retorna o valor real ao criar a intencao
 * (depositAmountInCents - payoutAmountInCents); o backend revalida saldo com o
 * retorno real. A estimativa local existe so pra UI antes da confirmacao.
 *
 * --- LIMITES DE OPERACAO ---
 *   Min  R$ 10,00  (deposito e saque) — abaixo nao compensa as taxas
 *   Max  R$ 5.000,00 (deposito e saque) — limite operacional
 */

export interface DepixFeeConfig {
  entryFeeFixed: number; // centavos
  entryFeePercent: number; // 0-100
  exitFeeFixed: number;
  exitFeePercent: number;
}

export interface DepositFeeBreakdown {
  grossCents: number;
  feeArenaTechCents: number;
  /** No deposito, fee PixPay sai do bruto antes de cair na carteira do tenant
   *  (estimativa pra UI; valor real eh `gross - depix.amount` recebido). */
  feePixPayEstimatedCents: number;
  /** O que efetivamente fica no saldo do tenant apos as 2 taxas. */
  netCents: number;
}

export interface WithdrawFeeBreakdown {
  grossCents: number;
  feeArenaTechCents: number;
  /** Estimativa da taxa do provedor no saque (valor real vem do PixPay:
   *  depositAmountInCents - payoutAmountInCents). */
  feePixPayEstimatedCents: number;
  /** Estimativa do que o destinatario recebe via PIX. */
  netCents: number;
}

/** Limites operacionais (centavos). Aplicados nos validators Zod. */
export const DEPIX_LIMITS = {
  /** Minimo de R$ 10,00 — abaixo as taxas devoram o valor. */
  MIN_CENTS: 1000,
  /** Maximo de R$ 5.000,00 — limite operacional do gateway PixPay. */
  MAX_CENTS: 500000,
} as const;

function roundCents(n: number): number {
  // ROUND_HALF_UP via Math.round (positivo: identico). Centavos sao positivos.
  return Math.round(n);
}

function pct(amountCents: number, percent: number): number {
  return roundCents((amountCents * percent) / 100);
}

/**
 * Estimativa da taxa do provedor (Eulen) no SAQUE em centavos: 1% fixo.
 *
 * A Eulen confirma o valor real no create withdraw (depositAmount - payout) e
 * o backend revalida o saldo com o retorno real — esta e so a estimativa do
 * preview. Recebe `requestedReaisCents` = valor LIQUIDO pretendido.
 */
export function estimatePixPayWithdrawFee(requestedReaisCents: number): number {
  if (requestedReaisCents <= 0) return 0;
  return roundCents(requestedReaisCents * 0.01); // 1% fixo (Eulen)
}

/** Estimativa da taxa Eulen no DEPOSITO em centavos: R$ 0,99 fixo. */
export function estimatePixPayDepositFee(_grossCents: number): number {
  return 99; // R$ 0,99 fixo (Eulen)
}

/**
 * Taxa do DEPOSITO. PixPay: 0,99 + 0,5% (linear).
 */
export function calcDepositFee(
  grossCents: number,
  cfg: DepixFeeConfig,
): DepositFeeBreakdown {
  const feeArena = cfg.entryFeeFixed + pct(grossCents, cfg.entryFeePercent);
  const feePixPay = estimatePixPayDepositFee(grossCents);
  const net = Math.max(0, grossCents - feeArena - feePixPay);
  return {
    grossCents,
    feeArenaTechCents: feeArena,
    feePixPayEstimatedCents: feePixPay,
    netCents: net,
  };
}

/**
 * Liquidacao do DEPOSITO a partir do valor que REALMENTE chegou on-chain.
 *
 * CRITICO: o valor on-chain JA esta liquido da taxa da Eulen — a Eulen desconta
 * o R$ 0,99 ANTES de enviar o DePix (ex.: PIX de R$ 10,00 -> R$ 9,01 on-chain).
 * Por isso aqui NAO se subtrai a taxa Eulen de novo (seria cobranca dupla, saldo
 * a menor); so a taxa Arena Tech e retida. `calcDepositFee` (usado no PREVIEW)
 * parte do valor que o pagador paga, entao la sim inclui a taxa Eulen.
 */
export function calcDepositSettlement(
  onchainCents: number,
  cfg: DepixFeeConfig,
): { feeArenaTechCents: number; netCents: number } {
  const feeArena = cfg.entryFeeFixed + pct(onchainCents, cfg.entryFeePercent);
  return {
    feeArenaTechCents: feeArena,
    netCents: Math.max(0, onchainCents - feeArena),
  };
}

/**
 * Taxa do SAQUE, calculada A PARTIR DO BRUTO (forward).
 * PixPay: taxa estimada sobre o payout PIX.
 *
 * No saque, o net (PIX entregue ao destinatario) eh o payout pretendido.
 */
export function calcWithdrawFee(
  grossCents: number,
  cfg: DepixFeeConfig,
): WithdrawFeeBreakdown {
  const feeArena = cfg.exitFeeFixed + pct(grossCents, cfg.exitFeePercent);
  // Procedimento iterativo: dado um gross, descobrir o net e a taxa do provedor
  // que satisfazem: gross - feeArena - feeProvider(net) = net. Como a taxa
  // depende do net, faz busca curta convergente.
  // Aproximacao inicial: assume net = gross - feeArena
  let net = grossCents - feeArena;
  let feePixPay = estimatePixPayWithdrawFee(Math.max(0, net));
  // 3 passos de refinamento sao suficientes (taxas suaves).
  for (let i = 0; i < 3; i++) {
    net = grossCents - feeArena - feePixPay;
    feePixPay = estimatePixPayWithdrawFee(Math.max(0, net));
  }
  net = Math.max(0, grossCents - feeArena - feePixPay);
  return {
    grossCents,
    feeArenaTechCents: feeArena,
    feePixPayEstimatedCents: feePixPay,
    netCents: net,
  };
}

/**
 * Inversa do saque: usuario informa o LIQUIDO (destinatario recebe X) e
 * calculamos o bruto a sair da carteira do tenant (com taxas empilhadas).
 *
 * Como a taxa PixPay depende do payout, calculamos a estimativa a partir do
 * `net` pretendido. Entao o bruto eh:
 *
 *   gross = net + feeArena(gross) + feeProvider(net)
 *
 * Mas feeArena depende do gross — precisamos da formula linear:
 *
 *   gross = (net + feeProvider(net) + exitFeeFixed) / (1 - exitFeePercent/100)
 *
 * Ajuste de drift: igual ao implementado antes pra garantir
 * forward(inverse(net)) = net e fee Arena = 0 exato pro tenant central.
 */
export function calcWithdrawFromNet(
  netCents: number,
  cfg: DepixFeeConfig,
): WithdrawFeeBreakdown {
  // 1. Taxa do provedor depende SO do net (valor que destinatario recebe).
  const feePixPay = estimatePixPayWithdrawFee(netCents);
  // 2. Resolve o gross usando a parte LINEAR da formula Arena Tech:
  //    gross = (net + feeProvider + exitFeeFixed) / (1 - exitFeePercent/100)
  if (cfg.exitFeePercent >= 100) {
    // Config degenerada
    return { grossCents: 0, feeArenaTechCents: 0, feePixPayEstimatedCents: feePixPay, netCents };
  }
  const numerator = netCents + feePixPay + cfg.exitFeeFixed;
  const denominator = 1 - cfg.exitFeePercent / 100;
  // ceil pra garantir que net pretendido eh atingido apos arredondamentos
  let grossCents = Math.ceil(numerator / denominator);
  // 3. Recalcula a taxa Arena Tech a partir do gross.
  const feeArena = cfg.exitFeeFixed + pct(grossCents, cfg.exitFeePercent);
  // 4. Drift: reduz o gross em ate 1-2 sat pra reconciliar
  //    (preserva taxa zero pra tenant central + consistencia forward/inverse)
  const drift = grossCents - feeArena - feePixPay - netCents;
  if (drift > 0) grossCents -= drift;
  return {
    grossCents,
    feeArenaTechCents: feeArena,
    feePixPayEstimatedCents: feePixPay,
    netCents,
  };
}
