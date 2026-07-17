/**
 * Detector da classe de bug "cache do LWK conta UTXOs já gastos como saldo".
 *
 * O `full_scan` do LWK é incremental e NÃO purga UTXO gasto do cache. Quando as
 * Esploras ficam degradadas durante gastos, o cache captura UTXOs que depois são
 * gastos on-chain e nunca os remove — inflando o saldo (incidente da carteira
 * central, 2026-07: 20 de 21 UTXOs de DePix estavam GASTOS). O guard de exibição
 * (resolveBalanceStaleness) evita mostrar o número errado; ESTE detector encontra
 * a corrupção ativamente, reconciliando os UTXOs do cache contra o spent-status
 * on-chain (que NÃO é confidencial na Liquid — dá pra consultar via `outspend`).
 *
 * A função aqui é PURA: recebe os UTXOs do cache já anotados com spent-status e
 * decide se a corrupção é material o suficiente pra alertar. A coleta (consultar a
 * Esplora) fica isolada no coletor, chamado pelo cron — mesmo padrão do
 * evaluateEsploraHealth.
 */

/** Um UTXO do cache do LWK anotado com o spent-status observado on-chain. */
export interface AnnotatedUtxo {
  /** "txid:vout" — identifica a saída on-chain. */
  outpoint: string;
  /** true se a saída já foi GASTA on-chain (mas ainda está no cache). */
  spent: boolean;
  /** Valor do UTXO em satoshis (para dimensionar o saldo fantasma). */
  valueSats: number;
}

export interface SpentUtxoAlert {
  spentCount: number;
  totalCount: number;
  /** Fração gasta (0..1). */
  ratio: number;
  /** Soma dos valores dos UTXOs gastos-mas-em-cache (o "saldo fantasma"). */
  phantomSats: number;
}

/** ≥ N UTXOs gastos presos no cache. Abaixo disso é ruído de sync (a próxima purga). */
export const SPENT_UTXO_MIN_TO_ALERT = 3;
/** Fração mínima de gastos presos. Junto com o mínimo absoluto, filtra oscilação. */
export const SPENT_UTXO_MIN_RATIO = 0.25;

/**
 * Alerta quando ≥ `minSpentToAlert` UTXOs do cache estão gastos on-chain E a
 * fração gasta ≥ `minRatio`. Os dois limiares juntos evitam ruído: um gasto
 * isolado numa carteira ativa é normal (a próxima sync purga), mas uma FRAÇÃO
 * material de gastos presos é a assinatura da corrupção.
 */
export function evaluateSpentUtxoRatio(
  utxos: AnnotatedUtxo[],
  opts?: { minSpentToAlert?: number; minRatio?: number },
): SpentUtxoAlert | null {
  if (utxos.length === 0) return null;
  const spent = utxos.filter((u) => u.spent);
  if (spent.length === 0) return null;

  const minSpent = opts?.minSpentToAlert ?? SPENT_UTXO_MIN_TO_ALERT;
  const minRatio = opts?.minRatio ?? SPENT_UTXO_MIN_RATIO;
  const ratio = spent.length / utxos.length;
  // Os DOIS limiares juntos: mínimo absoluto barra ruído em carteiras grandes;
  // fração mínima barra ruído em carteiras pequenas. A corrupção real dispara
  // ambos (o incidente: 20/21 = ratio 0.95, spent 20).
  if (spent.length < minSpent || ratio < minRatio) return null;

  return {
    spentCount: spent.length,
    totalCount: utxos.length,
    ratio,
    phantomSats: spent.reduce((sum, u) => sum + u.valueSats, 0),
  };
}
