/**
 * Confiança no saldo DePix consultado do LWK.
 *
 * O saldo vem do CACHE do LWK (sync=false, rápido) — que só é atualizado quando o
 * monitor de fundo consegue sincronizar com uma Esplora. Quando as Esploras
 * públicas degradam (caem/rate-limitam), o cache CONGELA: pode não refletir
 * gastos/recebimentos recentes e, no pior caso, contar UTXOs já gastos como saldo
 * (incidente do saldo inflado da carteira central, 2026-07). Exibir esse número
 * como verdade absoluta é enganoso.
 *
 * Este módulo traduz a saúde do sync (last_sync_ok_at, consecutive_failures) num
 * sinal simples: o saldo é confiável AGORA, ou pode estar desatualizado? A UI usa
 * isso pra avisar em vez de fabricar confiança num valor possivelmente errado.
 *
 * NÃO detecta a classe "cache com UTXO gasto embutido de uma queda passada" — essa
 * persiste mesmo com sync recente e exige reconciliação de spent-status (ver
 * auditoria). Aqui cobrimos a degradação de sync observável.
 */
import type { EsploraHealthResult } from "@/lib/services/lwk-service";

/**
 * Nº de falhas de sync consecutivas a partir do qual consideramos o saldo suspeito.
 * O monitor roda a cada poucos minutos; algumas falhas isoladas são ruído normal de
 * Esplora pública, mas uma sequência indica que o cache parou de atualizar.
 */
export const STALE_CONSECUTIVE_FAILURES = 3;

/**
 * Idade máxima (ms) do último sync bem-sucedido antes de considerar o saldo suspeito.
 * ~30min cobre folgadamente o intervalo do monitor; além disso, o cache está velho.
 */
export const STALE_LAST_SYNC_MS = 30 * 60 * 1000;

export interface BalanceStaleness {
  /** true = o saldo do cache pode não refletir a realidade on-chain agora. */
  stale: boolean;
  /** ISO do último sync bem-sucedido do LWK (para exibir "atualizado há X"). */
  lastSyncOkAt: string | null;
}

/**
 * Deriva a confiança no saldo a partir da saúde do sync do LWK.
 *
 * `health = null` (não deu pra consultar a saúde) → NÃO marca stale: um problema
 * transitório de leitura de saúde não deve poluir a UI com alarme falso; o saldo em
 * si pode estar perfeitamente fresco. Só marcamos stale quando temos EVIDÊNCIA de
 * degradação: readiness 503, falhas consecutivas acima do teto, ou último sync
 * antigo demais.
 *
 * `now` é injetável só para teste determinístico.
 */
export function resolveBalanceStaleness(
  health: EsploraHealthResult | null,
  now: number = Date.now(),
): BalanceStaleness {
  if (!health) return { stale: false, lastSyncOkAt: null };

  // LWK inalcançável: não conseguimos afirmar frescor — trate como suspeito.
  if (!health.reachable) return { stale: true, lastSyncOkAt: null };

  const lastSyncOkAt = health.health?.lastSyncOkAt ?? null;
  const consecutiveFailures = health.health?.consecutiveFailures ?? 0;

  // Esplora inalcançável AGORA (readiness 503) → cache congelado.
  if (health.degraded) return { stale: true, lastSyncOkAt };

  // Sequência de falhas de sync → o cache parou de atualizar.
  if (consecutiveFailures >= STALE_CONSECUTIVE_FAILURES) {
    return { stale: true, lastSyncOkAt };
  }

  // Nunca sincronizou com sucesso, ou faz tempo demais.
  if (!lastSyncOkAt) return { stale: true, lastSyncOkAt: null };
  const ageMs = now - new Date(lastSyncOkAt).getTime();
  if (Number.isNaN(ageMs) || ageMs > STALE_LAST_SYNC_MS) {
    return { stale: true, lastSyncOkAt };
  }

  return { stale: false, lastSyncOkAt };
}
