/**
 * Verificação ativa da integridade do cache do LWK (guard de recorrência do
 * incidente do saldo inflado, 2026-07).
 *
 * O `full_scan` do LWK é incremental e nunca purga UTXO gasto do cache. Este
 * serviço reconcilia os UTXOs de DePix do cache da carteira CENTRAL contra o
 * spent-status on-chain (endpoint `outspend` da Esplora — o spent-status NÃO é
 * confidencial na Liquid, só o valor é) e alerta quando uma fração material está
 * gasta-mas-presa no cache. Complementa o guard de exibição
 * (resolveBalanceStaleness): aquele evita mostrar o número errado; este ENCONTRA
 * a corrupção pra a gente reparar (purge + rescan).
 *
 * Roda de carona no cron de reconcile (mesmo padrão de checkEsploraHealth /
 * checkCentralLbtcFloor). Best-effort: nunca lança; se não der pra checar (LWK ou
 * Esplora indisponível), retorna sem alarme — "não sei" ≠ "está corrompido".
 */
import { getUtxos } from "@/lib/services/lwk-service";
import { DEPIX_ASSET } from "@/server/services/sideswap-swap.service";
import { CENTRAL_TENANT_SLUG } from "@/server/api/trpc";
import { withAdmin } from "@/server/db";
import { logger } from "@/lib/logger";
import {
  evaluateSpentUtxoRatio,
  type AnnotatedUtxo,
  type SpentUtxoAlert,
} from "@/lib/depix/spent-utxo-detector";

/** Esplora com endpoint `outspend`. Blockstream por padrão (config via env). */
const ESPLORA_OUTSPEND_BASE =
  process.env.DEPIX_ESPLORA_OUTSPEND_URL ?? "https://blockstream.info/liquid/api";

/**
 * Teto de outpoints checados por rodada. As Esploras públicas rate-limitam
 * rajadas; consultas espaçadas (1/vez) passam. 40 cobre a carteira central com
 * folga. Se houver mais, checamos os 40 primeiros e LOGAMOS o corte (auditoria:
 * nada de truncar em silêncio).
 */
const MAX_OUTPOINTS_PER_RUN = 40;
const OUTSPEND_SPACING_MS = 250;
const OUTSPEND_TIMEOUT_MS = 8_000;

async function isOutpointSpent(txid: string, vout: number): Promise<boolean | null> {
  try {
    const res = await fetch(`${ESPLORA_OUTSPEND_BASE}/tx/${txid}/outspend/${vout}`, {
      signal: AbortSignal.timeout(OUTSPEND_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { spent?: boolean };
    return typeof body.spent === "boolean" ? body.spent : null;
  } catch {
    return null;
  }
}

async function getCentralTenantId(): Promise<string | null> {
  const central = await withAdmin(async (tx) =>
    tx.tenant.findUnique({ where: { slug: CENTRAL_TENANT_SLUG }, select: { id: true } }),
  );
  return central?.id ?? null;
}

export interface CacheIntegrityResult {
  /** false = não deu pra avaliar (LWK/Esplora indisponível). Não é alarme. */
  assessed: boolean;
  alert: SpentUtxoAlert | null;
  /** true se a lista de UTXOs foi truncada pelo teto (checagem parcial). */
  truncated: boolean;
}

/**
 * Reconcilia os UTXOs de DePix da carteira central contra o spent-status on-chain.
 * Retorna um alerta quando há corrupção material. Não lança.
 */
export async function checkCentralCacheIntegrity(): Promise<CacheIntegrityResult> {
  const none: CacheIntegrityResult = { assessed: false, alert: null, truncated: false };
  try {
    const centralId = await getCentralTenantId();
    if (!centralId) return none;

    const utxosRes = await getUtxos(centralId, { assetId: DEPIX_ASSET });
    if (!utxosRes.success) return none;
    const utxos = utxosRes.utxos;
    if (utxos.length === 0) return { assessed: true, alert: null, truncated: false };

    const truncated = utxos.length > MAX_OUTPOINTS_PER_RUN;
    const toCheck = utxos.slice(0, MAX_OUTPOINTS_PER_RUN);

    const annotated: AnnotatedUtxo[] = [];
    for (const u of toCheck) {
      const spent = await isOutpointSpent(u.txid, u.vout);
      // Um outpoint que não deu pra checar é ignorado (não conta como vivo nem
      // gasto) — não queremos nem falso-alarme nem falso-conforto.
      if (spent === null) continue;
      annotated.push({ outpoint: `${u.txid}:${u.vout}`, spent, valueSats: u.value });
      await new Promise((r) => setTimeout(r, OUTSPEND_SPACING_MS));
    }

    // Cobertura insuficiente (Esplora derrubou a maioria das checagens) → não avalia.
    if (annotated.length < Math.min(toCheck.length, 4)) return none;

    const alert = evaluateSpentUtxoRatio(annotated);
    return { assessed: true, alert, truncated };
  } catch (err) {
    logger.warn("cache-integrity: falha ao avaliar (best-effort)", {
      err: err instanceof Error ? err.message : String(err),
    });
    return none;
  }
}

/**
 * Wrapper pro cron: avalia e ALERTA (logger.error → Sentry) quando encontra
 * corrupção. Nunca lança.
 */
export async function checkCentralCacheIntegrityAndAlert(): Promise<void> {
  const result = await checkCentralCacheIntegrity();
  if (result.truncated) {
    logger.warn("cache-integrity: carteira central com muitos UTXOs — checagem parcial", {
      max: MAX_OUTPOINTS_PER_RUN,
    });
  }
  if (result.alert) {
    logger.error(
      "cache-integrity: CACHE DO LWK COM UTXOs GASTOS — saldo pode estar inflado. Reparar (purge cache + rescan).",
      {
        tenant: CENTRAL_TENANT_SLUG,
        spentCount: result.alert.spentCount,
        totalCount: result.alert.totalCount,
        ratio: Number(result.alert.ratio.toFixed(3)),
        phantomBrl: (result.alert.phantomSats / 1e8).toFixed(2),
      },
    );
  }
}
