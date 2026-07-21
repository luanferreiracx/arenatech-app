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
import { TRPCError } from "@trpc/server";
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
 * Guard de saque: bloqueia um saque da carteira CENTRAL quando o cache do LWK
 * está com UTXOs gastos (saldo inflado). Sem isto, o gate de saldo confia no
 * número inflado, a Eulen aloca o off-ramp e a tx só quebra tarde, no broadcast,
 * com `bad-txns-inputs-missingorspent` (incidente TXW20260719-00001).
 *
 * FAIL-OPEN por design: só bloqueia quando CONFIRMA corrupção (`alert`). Se não
 * deu pra avaliar (Esplora/LWK indisponível → `assessed: false`), NÃO bloqueia —
 * "não sei" ≠ "está corrompido", e não queremos travar saque legítimo por uma
 * Esplora oscilando. O gate de saldo on-chain segue como segunda linha.
 *
 * Só se aplica à carteira central (o detector reconcilia os UTXOs dela); para os
 * demais tenants retorna sem checar.
 */
export async function assertCentralCacheHealthyForWithdraw(
  tenantId: string,
  centralId: string | null,
): Promise<void> {
  if (!centralId || tenantId !== centralId) return;

  const result = await checkCentralCacheIntegrity();
  if (!result.alert) return;

  const phantomBrl = (result.alert.phantomSats / 1e8).toFixed(2);
  logger.error(
    "depix-withdraw: BLOQUEADO — cache do LWK com UTXOs gastos (saldo inflado). Reparar antes de sacar.",
    {
      tenant: CENTRAL_TENANT_SLUG,
      spentCount: result.alert.spentCount,
      totalCount: result.alert.totalCount,
      ratio: Number(result.alert.ratio.toFixed(3)),
      phantomBrl,
    },
  );
  // PRECONDITION_FAILED: não é erro do operador nem falha transitória — é uma
  // pré-condição da carteira (cache precisa ser reparado). O router propaga como
  // está (mesmo padrão do gate de 2FA), sem contar contra brute-force.
  throw new TRPCError({
    code: "PRECONDITION_FAILED",
    message:
      `Saque bloqueado: o saldo on-chain está desatualizado (${result.alert.spentCount} de ${result.alert.totalCount} UTXOs já gastos, ~R$ ${phantomBrl} fantasma). ` +
      "Repare a carteira (purge de cache + rescan) antes de sacar — sem isso o saque falharia na transmissão.",
  });
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
