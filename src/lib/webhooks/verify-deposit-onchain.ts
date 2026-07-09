import * as lwk from "@/lib/services/lwk-service";

/**
 * Cross-check on-chain de um deposito DePix. Modulo isolado (so depende do
 * lwk-service) para ser reusado pelo webhook do monitor LWK, pelo webhook da
 * Eulen e pelo cron de reconciliacao SEM criar ciclo de import com o
 * depix-transaction.service.
 */

/**
 * Minimo de confirmacoes pra creditar deposito no DB.
 * Liquid Network = 1 bloco/min, 2 confs = ~2min, baixo risco de reorg.
 * Override via env LWK_MIN_CONFIRMATIONS pra testar.
 */
export const MIN_CONFIRMATIONS = Number(process.env.LWK_MIN_CONFIRMATIONS ?? "2");

/** Tolerancia de centavos no cross-check do amount (lida com arredondamento). */
export const AMOUNT_TOLERANCE_CENTS = 1;

/**
 * A Eulen desconta R$ 0,99 fixo do deposito ANTES de enviar o DePix on-chain.
 * Quando o `expectedAmount` e o valor CHEIO (ex.: QR estatico usa o valueInCents
 * da Eulen, ou a reconciliacao usa o grossAmountCents), o on-chain chega ATE
 * 99c MENOR — e isso e legitimo, nao um mismatch. O deposito normal nao precisa
 * disso (compara com o `depix.amount` do monitor, que ja e o valor on-chain real),
 * mas aceitar a folga PRA BAIXO nao o enfraquece: nunca aceitamos valor a MAIS.
 */
export const EULEN_DEPOSIT_FEE_CENTS = 99;

export interface CrossCheckResult {
  ok: boolean;
  reason?: string;
  onchainAmount: number;
}

/**
 * Verifica via LWK (servico on-chain) que o deposito realmente existe e bate com
 * o esperado. Sem isso, atacante com o secret HMAC poderia forjar um amount
 * arbitrario.
 *
 * Aceita o deposito se TODAS as condicoes batem:
 *   1. txid existe na carteira do tenant
 *   2. confirmations >= MIN_CONFIRMATIONS
 *   3. balance contem entrada DePix (is_depix=true)
 *   4. amount on-chain dentro da faixa esperada: nunca mais que +1c acima do
 *      esperado (anti-forja), e ate `maxUnderpayCents` abaixo (taxa fixa Eulen).
 */
export async function verifyDepositOnChain(args: {
  tenantId: string;
  txid: string;
  expectedAmount: number;
  expectedAddress: string | null;
  /** Quanto o on-chain pode ser MENOR que o esperado (default = taxa Eulen 99c).
   *  Use 0 quando o `expectedAmount` JA e o valor liquido on-chain. */
  maxUnderpayCents?: number;
  /** Timeout da consulta ao LWK. Curto no caminho do WEBHOOK (SLA ~15s da Eulen);
   *  default (30s) no cron/reconciliacao, onde a latencia nao importa. */
  lwkTimeoutMs?: number;
  /** `false` no WEBHOOK: le o cache do monitor (sem full_scan ~20s). Omitido no
   *  cron/reconciliacao, que sincroniza pra ter o estado on-chain mais fresco. */
  lwkSync?: boolean;
}): Promise<CrossCheckResult> {
  void args.expectedAddress; // LWK nao expoe address por output ainda — campo reservado
  const lwkResult = await lwk.listTransactions(args.tenantId, 50, {
    timeoutMs: args.lwkTimeoutMs,
    sync: args.lwkSync,
  });
  if (!lwkResult.success || !lwkResult.transactions) {
    return { ok: false, reason: `lwk_unavailable: ${lwkResult.error ?? "unknown"}`, onchainAmount: 0 };
  }
  const tx = lwkResult.transactions.find((t) => t.txid === args.txid);
  if (!tx) {
    return { ok: false, reason: "txid_not_found_onchain", onchainAmount: 0 };
  }
  if (tx.confirmations < MIN_CONFIRMATIONS) {
    return {
      ok: false,
      reason: `insufficient_confirmations: ${tx.confirmations} < ${MIN_CONFIRMATIONS}`,
      onchainAmount: 0,
    };
  }
  // Soma todos os outputs que sao DePix nesta tx.
  let onchainDepixAmount = 0;
  for (const entry of Object.values(tx.balance)) {
    if (entry.is_depix && entry.amount > 0) {
      onchainDepixAmount += entry.amount;
    }
  }
  if (onchainDepixAmount <= 0) {
    return { ok: false, reason: "no_depix_in_tx", onchainAmount: 0 };
  }
  // Faixa aceita: [expected − maxUnderpay, expected + tolerancia].
  // - Acima do esperado: so a tolerancia de arredondamento (anti-forja).
  // - Abaixo: ate a taxa fixa da Eulen (o on-chain ja vem liquido dela).
  const maxUnderpayCents = args.maxUnderpayCents ?? EULEN_DEPOSIT_FEE_CENTS;
  const deltaCents = Math.round((onchainDepixAmount - args.expectedAmount) * 100);
  const tooHigh = deltaCents > AMOUNT_TOLERANCE_CENTS;
  const tooLow = deltaCents < -maxUnderpayCents;
  if (tooHigh || tooLow) {
    return {
      ok: false,
      reason: `amount_mismatch: expected=${args.expectedAmount} onchain=${onchainDepixAmount}`,
      onchainAmount: onchainDepixAmount,
    };
  }
  return { ok: true, onchainAmount: onchainDepixAmount };
}
