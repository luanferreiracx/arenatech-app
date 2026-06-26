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
 *   4. amount on-chain == amount esperado (tolerancia de 1 centavo)
 */
export async function verifyDepositOnChain(args: {
  tenantId: string;
  txid: string;
  expectedAmount: number;
  expectedAddress: string | null;
}): Promise<CrossCheckResult> {
  void args.expectedAddress; // LWK nao expoe address por output ainda — campo reservado
  const lwkResult = await lwk.listTransactions(args.tenantId, 50);
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
  const diffCents = Math.round(Math.abs(onchainDepixAmount - args.expectedAmount) * 100);
  if (diffCents > AMOUNT_TOLERANCE_CENTS) {
    return {
      ok: false,
      reason: `amount_mismatch: payload=${args.expectedAmount} onchain=${onchainDepixAmount}`,
      onchainAmount: onchainDepixAmount,
    };
  }
  return { ok: true, onchainAmount: onchainDepixAmount };
}
