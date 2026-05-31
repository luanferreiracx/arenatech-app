/**
 * Calculo PURO das taxas DePix (sem side effects). Centavos in/out — sempre
 * inteiro pra evitar floating point em dinheiro.
 *
 * Modelo Arena Tech (taxa cobrada do tenant):
 *   - Entrada (deposito): R$ entryFeeFixed + entryFeePercent% sobre o bruto
 *   - Saida  (saque):     R$ exitFeeFixed  + exitFeePercent%  sobre o bruto
 *
 * Empilha sobre a taxa do gateway PixPay (calculada abaixo). UI mostra
 * breakdown transparente.
 *
 * --- TABELA PIXPAY (medida empiricamente em 2026-05-31 em prod) ---
 *
 * DEPOSITO: R$ 0,99 fixo + 0,5% sobre o valor pago pelo cliente. Linear.
 *
 * SAQUE: ESCALONADO em 3 faixas (NAO eh linear simples):
 *   - valor <= R$ 100:        fee = R$ 1,99 (piso)
 *   - R$ 100 < valor <= R$ 800: fee = R$ 1,99 + 1,65% * (valor - 100)
 *   - valor > R$ 800:         fee = R$ 5,50 + 1,00% * valor
 * Pontos de validacao (max erro R$ 0,22 — caso da R$ 250):
 *   R$ 100  -> R$ 1,99      R$ 999  -> R$ 15,49
 *   R$ 250  -> R$ 4,25      R$ 1000 -> R$ 15,50
 *   R$ 400  -> R$ 6,96      R$ 2000 -> R$ 25,50
 *   R$ 800  -> R$ 13,50     R$ 5000 -> R$ 55,50
 * Valor real eh sempre o que a PixPay retorna no createDepixWithdraw
 * (depositAmountInCents - payoutAmountInCents) — a estimativa aqui eh
 * so pra UI mostrar pro usuario antes de confirmar.
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
  /** Estimativa da taxa PixPay no saque (valor real vem do
   *  createDepixWithdraw: depositAmountInCents - payoutAmountInCents). */
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
 * Estimativa da taxa PixPay no SAQUE em centavos (tabela escalonada).
 *
 *   - <= R$ 100:        R$ 1,99 (piso)
 *   - R$ 100 a R$ 800:  R$ 1,99 + 1,65% sobre o que excede R$ 100
 *   - > R$ 800:         R$ 5,50 + 1,00% sobre o valor todo
 *
 * Recebe `requestedReaisCents` = valor LIQUIDO pretendido pelo destinatario
 * (eh o que PixPay efetivamente envia em PIX).
 */
export function estimatePixPayWithdrawFee(requestedReaisCents: number): number {
  if (requestedReaisCents <= 10000) {
    return 199; // R$ 1,99
  }
  if (requestedReaisCents <= 80000) {
    // R$ 1,99 + 1,65% sobre o excedente acima de R$ 100
    return 199 + roundCents((requestedReaisCents - 10000) * 1.65 / 100);
  }
  // > R$ 800: R$ 5,50 + 1% sobre o valor todo
  return 550 + roundCents(requestedReaisCents * 1.0 / 100);
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
 * PixPay: tabela escalonada (ver estimatePixPayWithdrawFee).
 *
 * No saque, o net (PIX entregue ao destinatario) eh o "requested" do PixPay —
 * eh sobre ele que a taxa PixPay incide.
 */
export function calcWithdrawFee(
  grossCents: number,
  cfg: DepixFeeConfig,
): WithdrawFeeBreakdown {
  const feeArena = cfg.exitFeeFixed + pct(grossCents, cfg.exitFeePercent);
  // Procedimento iterativo: dado um gross, descobrir o net e a taxa PixPay
  // que satisfazem: gross - feeArena - feePixPay(net) = net. Como feePixPay
  // depende do net (a tabela), faz busca curta convergente.
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
 * Como a taxa PixPay eh ESCALONADA (nao linear), precisamos resolver por
 * faixa. O calculo direto eh: dado `net`, a taxa PixPay eh
 * `estimatePixPayWithdrawFee(net)` (PixPay calcula sobre o `requested`, que
 * eh o net pretendido). Entao o bruto eh:
 *
 *   gross = net + feeArena(gross) + feePixPay(net)
 *
 * Mas feeArena depende do gross — precisamos da formula linear:
 *
 *   gross = (net + feePixPay(net) + exitFeeFixed) / (1 - exitFeePercent/100)
 *
 * Ajuste de drift: igual ao implementado antes pra garantir
 * forward(inverse(net)) = net e fee Arena = 0 exato pro tenant central.
 */
export function calcWithdrawFromNet(
  netCents: number,
  cfg: DepixFeeConfig,
): WithdrawFeeBreakdown {
  // 1. Taxa PixPay depende SO do net (valor que destinatario recebe).
  const feePixPay = estimatePixPayWithdrawFee(netCents);
  // 2. Resolve o gross usando a parte LINEAR da formula Arena Tech:
  //    gross = (net + feePixPay + exitFeeFixed) / (1 - exitFeePercent/100)
  if (cfg.exitFeePercent >= 100) {
    // Config degenerada
    return { grossCents: 0, feeArenaTechCents: 0, feePixPayEstimatedCents: feePixPay, netCents };
  }
  const numerator = netCents + feePixPay + cfg.exitFeeFixed;
  const denominator = 1 - cfg.exitFeePercent / 100;
  // ceil pra garantir que net pretendido eh atingido apos arredondamentos
  let grossCents = Math.ceil(numerator / denominator);
  // 3. Recalcula a taxa Arena Tech a partir do gross
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
