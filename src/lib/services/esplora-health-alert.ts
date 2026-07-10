import type { EsploraHealthResult } from "@/lib/services/lwk-service";

/**
 * Decide se a saúde da Esplora do LWK merece um ALERTA (auditoria de resiliência:
 * as Esploras públicas já morreram 2x e só descobríamos pelo alerta da Eulen —
 * tarde). Pura e testável; o cron chama e emite `logger.error` (→ Sentry) quando
 * retorna um alerta. Ver [[eulen-webhook-lwk-timeout]].
 *
 * Alerta quando o LWK está acessível MAS:
 *  - houve N syncs seguidos com todas as Esploras falhando, OU
 *  - o último sync bem-sucedido é mais antigo que `maxStaleMs` (Esploras mudas
 *    há tempo demais — o cross-check do webhook vai começar a falhar).
 *
 * NÃO alerta se o LWK está inacessível (`reachable=false`) — isso é outro
 * problema (LWK caído), tratado por quem depende dele, não por este monitor de
 * Esplora. Também não alerta na primeira falha isolada (oscilação normal).
 */
export const ESPLORA_ALERT_CONSECUTIVE_FAILURES = 3;
export const ESPLORA_ALERT_MAX_STALE_MS = 5 * 60 * 1000; // 5 min sem sync-ok

export type EsploraHealthAlert = {
  reason: "consecutive_failures" | "stale_sync";
  detail: Record<string, unknown>;
};

export function evaluateEsploraHealth(
  result: EsploraHealthResult,
  nowMs: number,
  opts?: { maxConsecutiveFailures?: number; maxStaleMs?: number },
): EsploraHealthAlert | null {
  // LWK inacessível não é problema de Esplora — não alertamos aqui.
  if (!result.reachable || !result.health) return null;

  const maxFailures = opts?.maxConsecutiveFailures ?? ESPLORA_ALERT_CONSECUTIVE_FAILURES;
  const maxStaleMs = opts?.maxStaleMs ?? ESPLORA_ALERT_MAX_STALE_MS;
  const { consecutiveFailures, lastSyncOkAt, lastWorkingUrl } = result.health;

  if (consecutiveFailures >= maxFailures) {
    return {
      reason: "consecutive_failures",
      detail: { consecutiveFailures, lastWorkingUrl, degraded: result.degraded },
    };
  }

  // Sem nenhum sync-ok registrado ainda: só alerta se também houve falhas (senão
  // é boot recente, não uma degradação). O ramo acima já cobre falhas repetidas.
  if (lastSyncOkAt) {
    const ageMs = nowMs - new Date(lastSyncOkAt).getTime();
    if (Number.isFinite(ageMs) && ageMs > maxStaleMs) {
      return {
        reason: "stale_sync",
        detail: { lastSyncOkAt, ageMinutes: Math.round(ageMs / 60000), lastWorkingUrl },
      };
    }
  }

  return null;
}
