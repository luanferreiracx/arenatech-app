/**
 * Verificação ativa da integridade do cache do LWK (guard de recorrência do
 * incidente do saldo inflado, 2026-07).
 *
 * O `full_scan` do LWK é incremental e nunca purga UTXO gasto do cache. Este
 * serviço reconcilia os UTXOs de DePix de CADA carteira contra o spent-status
 * on-chain (endpoint `outspend` da Esplora — o spent-status NÃO é confidencial
 * na Liquid, só o valor é) e alerta quando uma fração material está gasta-mas-
 * presa no cache. Complementa o guard de exibição (resolveBalanceStaleness):
 * aquele evita mostrar o número errado; este ENCONTRA a corrupção pra a gente
 * reparar (purge + rescan).
 *
 * ## Por que deixou de ser "só a central" (2026-08-02)
 *
 * Nasceu olhando uma carteira só porque só existia uma em uso. Medido em
 * produção antes desta mudança: a carteira espelho do tenant NO-KYC, que
 * compartilha descriptor com a central, reportava R$ 11.993,93 contra
 * R$ 14.356,37 da central — a MESMA carteira on-chain, R$ 2.362,44 de
 * divergência, sem detector, sem reparo e sem alarme, porque o serviço só
 * enxergava a central. Cadastrar cliente é multiplicar carteiras; uma proteção
 * que cobre uma delas protege cada vez menos.
 *
 * Roda de carona no cron de reconcile (mesmo padrão de checkEsploraHealth /
 * checkCentralLbtcFloor). Best-effort: nunca lança; se não der pra checar (LWK ou
 * Esplora indisponível), retorna sem alarme — "não sei" ≠ "está corrompido".
 */
import { TRPCError } from "@trpc/server";
import { getUtxos } from "@/lib/services/lwk-service";
import { DEPIX_ASSET } from "@/server/services/sideswap-swap.service";
import { withAdmin } from "@/server/db";
import { logger } from "@/lib/logger";
import {
  evaluateSpentUtxoRatio,
  type AnnotatedUtxo,
  type SpentUtxoAlert,
} from "@/lib/depix/spent-utxo-detector";
import { planCacheIntegrityRun } from "@/lib/depix/cache-integrity-plan";

/** Esplora com endpoint `outspend`. Blockstream por padrão (config via env). */
const ESPLORA_OUTSPEND_BASE =
  process.env.DEPIX_ESPLORA_OUTSPEND_URL ?? "https://blockstream.info/liquid/api";

/**
 * Teto de outpoints por carteira numa passada do cron. As Esploras públicas
 * rate-limitam rajadas; consultas espaçadas (1/vez) passam. 40 cobre a carteira
 * central com folga.
 */
const MAX_OUTPOINTS_PER_WALLET = 40;

/**
 * Teto de outpoints da RODADA inteira, somando todas as carteiras.
 *
 * Sem um teto global, o custo do cron cresceria linear no número de clientes
 * contra a Esplora pública — que é justamente o recurso escasso cuja degradação
 * causa a corrupção que estamos detectando. O anel de `planCacheIntegrityRun`
 * garante que o que não coube hoje é o primeiro da próxima rodada.
 */
const MAX_OUTPOINTS_PER_RUN = 80;

/** Espaçamento entre consultas à Esplora (anti rate-limit). */
const OUTSPEND_SPACING_MS = 250;
const OUTSPEND_TIMEOUT_MS = 8_000;

/** Teto de tempo de parede da coleta de UMA carteira no cron. */
const CRON_DEADLINE_MS = 60_000;

/**
 * Teto da varredura INTEIRA de uma rodada.
 *
 * O teto por carteira sozinho não limita a rodada: com Esplora lenta, N
 * carteiras multiplicam o prazo, e o cron de reconcile faz muito mais coisa
 * depois desta varredura. Uma checagem best-effort de saldo não pode empurrar
 * para fora do relógio a reconciliação de saque, que é o que destrava dinheiro
 * preso.
 */
const CRON_TOTAL_DEADLINE_MS = 90_000;

/**
 * Orçamento do guard de saque — muito mais apertado que o do cron, porque aqui
 * um humano está esperando com o dedo no botão.
 *
 * 12 outpoints ainda batem os dois limiares do detector (≥3 gastos e ≥25%): um
 * cache corrompido de verdade tem entre metade e quase todos os UTXOs gastos
 * (os incidentes reais: 20/21, 102/122, 18/40), então a amostra acusa. E o
 * deadline existe porque sem ele o pior caso do guard era 40 outpoints × 8s de
 * timeout = mais de cinco minutos de saque pendurado quando a Esplora está
 * lenta — que é precisamente quando ela fica lenta.
 */
const WITHDRAW_GUARD_MAX_OUTPOINTS = 12;
const WITHDRAW_GUARD_DEADLINE_MS = 4_000;
const WITHDRAW_GUARD_OUTSPEND_TIMEOUT_MS = 2_000;
const WITHDRAW_GUARD_UTXOS_TIMEOUT_MS = 8_000;

/** Intervalo nominal do cron; converte relógio em número de rodada pro anel. */
const CRON_INTERVAL_MS = 10 * 60_000;

async function isOutpointSpent(
  txid: string,
  vout: number,
  timeoutMs: number,
): Promise<boolean | null> {
  try {
    const res = await fetch(`${ESPLORA_OUTSPEND_BASE}/tx/${txid}/outspend/${vout}`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { spent?: boolean };
    return typeof body.spent === "boolean" ? body.spent : null;
  } catch {
    return null;
  }
}

/**
 * Carteiras que têm cache do LWK para checar: provisionadas e não-externas.
 *
 * `external` fica de fora porque a Arena não custodia nada nesse modo — não há
 * carteira nossa, logo não há cache nosso para corromper. Ordem estável por id:
 * o anel da rotação depende de a posição não mudar entre rodadas.
 */
export async function listWalletsWithLwkCache(): Promise<string[]> {
  const wallets = await withAdmin(async (tx) =>
    tx.tenantDepixWallet.findMany({
      where: { provisionedAt: { not: null }, custodyModel: { not: "external" } },
      select: { tenantId: true },
      orderBy: { tenantId: "asc" },
    }),
  );
  return wallets.map((w) => w.tenantId);
}

export interface CacheIntegrityResult {
  /** false = não deu pra avaliar (LWK/Esplora indisponível). Não é alarme. */
  assessed: boolean;
  alert: SpentUtxoAlert | null;
  /** true se a lista de UTXOs foi truncada pelo teto (checagem parcial). */
  truncated: boolean;
  /**
   * true = o próprio LWK não devolveu os UTXOs da carteira.
   *
   * Distinto de `assessed: false` genérico: aqui a falha é NA CARTEIRA, não na
   * Esplora. Quando o cache corrompe (`UpdateOnDifferentStatus`), /utxos e
   * /balance respondem `internal_error` — e o saldo que passou pelo gate de saque
   * veio desse mesmo cache quebrado. Sacar nesse estado aloca off-ramp na Eulen e
   * morre no broadcast (incidente TXW20260727-00002).
   */
  walletUnreadable: boolean;
}

const NOT_ASSESSED: CacheIntegrityResult = {
  assessed: false,
  alert: null,
  truncated: false,
  walletUnreadable: false,
};

/**
 * Reconcilia os UTXOs de DePix de UMA carteira contra o spent-status on-chain.
 * Retorna um alerta quando há corrupção material. Não lança.
 */
export async function checkWalletCacheIntegrity(
  tenantId: string,
  opts?: {
    maxOutpoints?: number;
    /** Teto de tempo de parede da coleta. Passado o prazo, avalia o que juntou. */
    deadlineMs?: number;
    outspendTimeoutMs?: number;
    utxosTimeoutMs?: number;
  },
): Promise<CacheIntegrityResult> {
  const maxOutpoints = opts?.maxOutpoints ?? MAX_OUTPOINTS_PER_WALLET;
  const deadline = Date.now() + (opts?.deadlineMs ?? CRON_DEADLINE_MS);
  const outspendTimeout = opts?.outspendTimeoutMs ?? OUTSPEND_TIMEOUT_MS;

  try {
    const utxosRes = await getUtxos(tenantId, {
      assetId: DEPIX_ASSET,
      timeoutMs: opts?.utxosTimeoutMs,
      // Sem sync de propósito: este guard existe para auditar o que ESTÁ no
      // cache. Forçar um full_scan aqui é contraditório (mediria o estado
      // depois de consertado) e, com Esplora distante, custa ~70s — acima do
      // timeout do app, o que fazia o guard falhar por timeout e bloquear
      // saque/depósito com a carteira íntegra (incidente 2026-08-06).
      sync: false,
    });
    // O LWK não conseguiu listar os UTXOs. Não é "Esplora oscilando": é a
    // carteira que não abre. Sinalizamos separado pro guard de saque poder
    // bloquear sem transformar toda instabilidade de Esplora em bloqueio.
    if (!utxosRes.success) return { ...NOT_ASSESSED, walletUnreadable: true };
    const utxos = utxosRes.utxos;
    if (utxos.length === 0) {
      return { assessed: true, alert: null, truncated: false, walletUnreadable: false };
    }

    const truncated = utxos.length > maxOutpoints;
    const toCheck = utxos.slice(0, maxOutpoints);

    const annotated: AnnotatedUtxo[] = [];
    for (const utxo of toCheck) {
      if (Date.now() > deadline) break;
      const spent = await isOutpointSpent(utxo.txid, utxo.vout, outspendTimeout);
      // Um outpoint que não deu pra checar é ignorado (não conta como vivo nem
      // gasto) — não queremos nem falso-alarme nem falso-conforto.
      if (spent === null) continue;
      annotated.push({ outpoint: `${utxo.txid}:${utxo.vout}`, spent, valueSats: utxo.value });
      await new Promise((resolve) => setTimeout(resolve, OUTSPEND_SPACING_MS));
    }

    // Cobertura insuficiente (Esplora derrubou a maioria das checagens, ou o
    // deadline estourou) → não avalia.
    if (annotated.length < Math.min(toCheck.length, 4)) return NOT_ASSESSED;

    const alert = evaluateSpentUtxoRatio(annotated);
    return { assessed: true, alert, truncated, walletUnreadable: false };
  } catch (err) {
    logger.warn("cache-integrity: falha ao avaliar (best-effort)", {
      tenantId,
      err: err instanceof Error ? err.message : String(err),
    });
    return NOT_ASSESSED;
  }
}

/**
 * Guard de saque: bloqueia o saque quando o cache do LWK DAQUELE tenant está com
 * UTXOs gastos (saldo inflado). Sem isto, o gate de saldo confia no número
 * inflado, a Eulen aloca o off-ramp e a tx só quebra tarde, no broadcast, com
 * `bad-txns-inputs-missingorspent` (incidente TXW20260719-00001).
 *
 * FAIL-OPEN por design: só bloqueia quando CONFIRMA corrupção (`alert`). Se não
 * deu pra avaliar (Esplora/LWK indisponível → `assessed: false`), NÃO bloqueia —
 * "não sei" ≠ "está corrompido", e não queremos travar saque legítimo por uma
 * Esplora oscilando. O gate de saldo on-chain segue como segunda linha.
 *
 * Vale para QUALQUER carteira. Antes valia só para a central, o que deixava todo
 * saque de cliente sem guarda nenhuma contra a falha que já quebrou saque em
 * produção duas vezes.
 */
export async function assertWalletCacheHealthyForWithdraw(tenantId: string): Promise<void> {
  const result = await checkWalletCacheIntegrity(tenantId, {
    maxOutpoints: WITHDRAW_GUARD_MAX_OUTPOINTS,
    deadlineMs: WITHDRAW_GUARD_DEADLINE_MS,
    outspendTimeoutMs: WITHDRAW_GUARD_OUTSPEND_TIMEOUT_MS,
    utxosTimeoutMs: WITHDRAW_GUARD_UTXOS_TIMEOUT_MS,
  });

  // Carteira ilegível: o LWK não lista os UTXOs. Bloqueia o saque — o número que
  // passou pelo gate de saldo veio do MESMO cache que não abre, e saque é
  // irreversível.
  //
  // ESCOPO REAL desta guarda (não confundir com o TXW20260727-00002): `getBalance`
  // roda ANTES daqui e já barra com SERVICE_UNAVAILABLE quando a carteira não
  // responde. Então isto só dispara na janela estreita em que o /balance responde
  // (cache lido com sync=false) mas o /utxos falha — ou seja, o saldo exibido pode
  // ser lixo e não temos como conferir. É defesa em profundidade, não a correção
  // daquele incidente: lá o /balance funcionou, o transfer FOI transmitido e só a
  // resposta se perdeu (ver PR #728).
  if (result.walletUnreadable) {
    logger.error(
      "depix-withdraw: BLOQUEADO — LWK nao consegue ler os UTXOs da carteira (cache possivelmente corrompido).",
      { tenantId },
    );
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Saque bloqueado: nao foi possivel ler a sua carteira (cache indisponivel). " +
        "A carteira precisa ser reparada antes do saque — sem isso o saque falharia na transmissao.",
    });
  }

  if (!result.alert) return;

  const phantomBrl = (result.alert.phantomSats / 1e8).toFixed(2);
  logger.error(
    "depix-withdraw: BLOQUEADO — cache do LWK com UTXOs gastos (saldo inflado). Reparar antes de sacar.",
    {
      tenantId,
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
      "A carteira precisa ser reparada antes do saque — sem isso o saque falharia na transmissão.",
  });
}

/**
 * Wrapper pro cron: varre as carteiras da rodada e ALERTA (logger.error → Sentry)
 * quando encontra corrupção. Nunca lança.
 */
export async function checkWalletCachesAndAlert(nowMs = Date.now()): Promise<void> {
  let tenantIds: string[];
  try {
    tenantIds = await listWalletsWithLwkCache();
  } catch (err) {
    logger.warn("cache-integrity: falha ao listar carteiras (best-effort)", {
      err: err instanceof Error ? err.message : String(err),
    });
    return;
  }
  if (tenantIds.length === 0) return;

  const { checks, skipped } = planCacheIntegrityRun({
    tenantIds,
    runIndex: Math.floor(nowMs / CRON_INTERVAL_MS),
    totalOutpointBudget: MAX_OUTPOINTS_PER_RUN,
    maxOutpointsPerWallet: MAX_OUTPOINTS_PER_WALLET,
  });

  // Corte silencioso lê como "checamos tudo". Quem sobrou é o primeiro da
  // próxima rodada, mas isso precisa estar escrito em algum lugar auditável.
  if (skipped.length > 0) {
    logger.warn("cache-integrity: carteiras adiadas para a proxima rodada (orcamento da rodada)", {
      skipped: skipped.length,
      checked: checks.length,
      totalWallets: tenantIds.length,
    });
  }

  const runDeadline = nowMs + CRON_TOTAL_DEADLINE_MS;
  for (const check of checks) {
    const remainingMs = runDeadline - Date.now();
    if (remainingMs <= 0) {
      logger.warn("cache-integrity: rodada estourou o prazo — carteiras restantes ficam para a proxima", {
        tenantId: check.tenantId,
      });
      break;
    }
    const result = await checkWalletCacheIntegrity(check.tenantId, {
      maxOutpoints: check.maxOutpoints,
      deadlineMs: Math.min(CRON_DEADLINE_MS, remainingMs),
    });

    if (result.truncated) {
      logger.warn("cache-integrity: carteira com muitos UTXOs — checagem parcial", {
        tenantId: check.tenantId,
        max: check.maxOutpoints,
      });
    }
    // Carteira ilegível é incidente, não ruído: em 2026-07-27 o LWK ficou ~7h
    // respondendo internal_error sem ninguém notar, porque só o auto-reparo (que
    // morria antes de reparar) enxergava a falha. Alerta explícito → Sentry.
    if (result.walletUnreadable) {
      logger.error(
        "cache-integrity: LWK NAO CONSEGUE LER A CARTEIRA — saldo indisponivel e saque bloqueado. Reparar (purge cache + rescan).",
        { tenantId: check.tenantId },
      );
    }
    if (result.alert) {
      logger.error(
        "cache-integrity: CACHE DO LWK COM UTXOs GASTOS — saldo pode estar inflado. Reparar (purge cache + rescan).",
        {
          tenantId: check.tenantId,
          spentCount: result.alert.spentCount,
          totalCount: result.alert.totalCount,
          ratio: Number(result.alert.ratio.toFixed(3)),
          phantomBrl: (result.alert.phantomSats / 1e8).toFixed(2),
        },
      );
    }
  }
}
