/**
 * Calculo PURO das taxas DePix (sem side effects). Centavos in/out — sempre
 * inteiro pra evitar floating point em dinheiro.
 *
 * Modelo Arena Tech:
 *   - Entrada (deposito): R$ entryFeeFixed + entryFeePercent% sobre o bruto
 *   - Saida  (saque):     R$ exitFeeFixed  + exitFeePercent%  sobre o bruto
 *
 * Empilha sobre a taxa do gateway PixPay (que sai do bruto antes de chegar
 * no destino). UI mostra breakdown transparente.
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

function roundCents(n: number): number {
  // ROUND_HALF_UP via Math.round (positivo: identico). Centavos sao positivos.
  return Math.round(n);
}

function pct(amountCents: number, percent: number): number {
  return roundCents((amountCents * percent) / 100);
}

/**
 * Taxa do deposito. PixPay estimada padrao: 0,5% + R$ 0,99 (paridade
 * observada — mas ajustavel via env PIXPAY_FEE_ESTIMATE_PCT/FIXED).
 */
export function calcDepositFee(
  grossCents: number,
  cfg: DepixFeeConfig,
  opts: { pixpayPct?: number; pixpayFixedCents?: number } = {},
): DepositFeeBreakdown {
  const pixpayPct = opts.pixpayPct ?? 0.5;
  const pixpayFixed = opts.pixpayFixedCents ?? 99;
  const feeArena = cfg.entryFeeFixed + pct(grossCents, cfg.entryFeePercent);
  const feePixPay = pixpayFixed + pct(grossCents, pixpayPct);
  const net = Math.max(0, grossCents - feeArena - feePixPay);
  return {
    grossCents,
    feeArenaTechCents: feeArena,
    feePixPayEstimatedCents: feePixPay,
    netCents: net,
  };
}

/**
 * Taxa do saque, calculada A PARTIR DO BRUTO (forward).
 * PixPay estimada padrao: 1,3% + R$ 0,99 (observado em prod — confirmado
 * quando o createDepixWithdraw retorna depositAmount/payoutAmount).
 */
export function calcWithdrawFee(
  grossCents: number,
  cfg: DepixFeeConfig,
  opts: { pixpayPct?: number; pixpayFixedCents?: number } = {},
): WithdrawFeeBreakdown {
  const pixpayPct = opts.pixpayPct ?? 1.3;
  const pixpayFixed = opts.pixpayFixedCents ?? 99;
  const feeArena = cfg.exitFeeFixed + pct(grossCents, cfg.exitFeePercent);
  const feePixPay = pixpayFixed + pct(grossCents, pixpayPct);
  const net = Math.max(0, grossCents - feeArena - feePixPay);
  return {
    grossCents,
    feeArenaTechCents: feeArena,
    feePixPayEstimatedCents: feePixPay,
    netCents: net,
  };
}

/**
 * Inversa do saque: o usuario informa o LIQUIDO que o destinatario deve
 * receber, e calculamos o bruto que precisa sair da carteira (com taxas
 * empilhadas).
 *
 * Algebra:
 *   net = gross - feeArena - feePixPay
 *   feeArena   = exitFixed + gross * exitPct/100
 *   feePixPay  = pixpayFixed + gross * pixpayPct/100
 *   gross = (net + exitFixed + pixpayFixed) / (1 - (exitPct + pixpayPct)/100)
 *
 * Ajuste de centavos: o arredondamento individual de cada percentual pode
 * gerar diferenca de 1 sat com o calculo direto — reconciliamos no fim
 * forcando net = gross - feeArena - feePixPay exato (somando o "drift" no
 * feeArena pra simplificar — eh a nossa taxa, podemos cobrar +1 sat).
 */
export function calcWithdrawFromNet(
  netCents: number,
  cfg: DepixFeeConfig,
  opts: { pixpayPct?: number; pixpayFixedCents?: number } = {},
): WithdrawFeeBreakdown {
  const pixpayPct = opts.pixpayPct ?? 1.3;
  const pixpayFixed = opts.pixpayFixedCents ?? 99;
  const totalPct = cfg.exitFeePercent + pixpayPct;
  if (totalPct >= 100) {
    // Config degenerada — impossivel calcular bruto. Devolve net=0 pra UI mostrar erro.
    return { grossCents: 0, feeArenaTechCents: 0, feePixPayEstimatedCents: 0, netCents };
  }
  const numerator = netCents + cfg.exitFeeFixed + pixpayFixed;
  const denominator = 1 - totalPct / 100;
  // ceil pra garantir que net pretendido eh atingido apos arredondamentos
  let grossCents = Math.ceil(numerator / denominator);
  // Calcula as taxas a partir do bruto resolvido
  const feeArena = cfg.exitFeeFixed + pct(grossCents, cfg.exitFeePercent);
  const feePixPay = pixpayFixed + pct(grossCents, pixpayPct);
  // Drift de arredondamento (positivo: gross excede em +1 sat).
  // Reduz o gross — garante:
  //   (a) consistencia forward(inverse(net)) = net
  //   (b) tenant central permanece com fee Arena Tech = 0 exato
  const drift = grossCents - feeArena - feePixPay - netCents;
  if (drift > 0) grossCents -= drift;
  return {
    grossCents,
    feeArenaTechCents: feeArena,
    feePixPayEstimatedCents: feePixPay,
    netCents,
  };
}
