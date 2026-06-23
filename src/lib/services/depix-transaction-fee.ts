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
 * DEPOSITO: PixPay cobra R$ 0,99 fixo + 0,5% sobre o valor pago pelo cliente.
 * Linear.
 *
 * SAQUE: PixPay retorna o valor real ao criar a intencao
 * (depositAmountInCents - payoutAmountInCents). A estimativa local usa a regra
 * observada na documentacao: payout = deposit - 1%. Ela existe so pra UI antes
 * da confirmacao; o backend revalida saldo com o retorno real do PixPay.
 *
 * --- LIMITES DE OPERACAO ---
 *   Min  R$ 10,00  (deposito e saque) — abaixo nao compensa as taxas
 *   Max  R$ 5.000,00 (deposito e saque) — limite operacional PixPay
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
 * Estimativa da taxa do provedor (PixPay) no SAQUE em centavos.
 *
 * O PixPay confirma o valor real no create withdraw (depositAmount - payout);
 * o backend revalida o saldo com o retorno real. Esta e so a estimativa do
 * preview, conforme a tabela documentada do PixPay.
 * Recebe `requestedReaisCents` = valor LIQUIDO pretendido pelo destinatario.
 */
export function estimatePixPayWithdrawFee(requestedReaisCents: number): number {
  if (requestedReaisCents <= 0) return 0;
  if (requestedReaisCents <= 10000) {
    return 199; // R$ 1,99 ate R$ 100
  }
  if (requestedReaisCents <= 80000) {
    // R$ 1,99 + 1,65% sobre o excedente acima de R$ 100
    return 199 + roundCents(((requestedReaisCents - 10000) * 1.65) / 100);
  }
  // > R$ 800: R$ 5,50 + 1% sobre o valor todo
  return 550 + roundCents((requestedReaisCents * 1.0) / 100);
}

/** Estimativa da taxa PixPay no DEPOSITO em centavos: R$ 0,99 + 0,5% linear. */
export function estimatePixPayDepositFee(grossCents: number): number {
  return 99 + pct(grossCents, 0.5);
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
