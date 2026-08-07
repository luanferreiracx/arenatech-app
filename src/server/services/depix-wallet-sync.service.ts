/**
 * Sync periódico das carteiras do LWK.
 *
 * O monitor de fundo do LWK (`MONITOR_ENABLED`) fica DESLIGADO de propósito: além
 * de sincronizar, ele detecta depósitos on-chain e dispara webhook, criando um
 * segundo caminho de depósito além da Eulen. Não queremos esse caminho.
 *
 * Só que o sync vinha junto — e sem ele o cache do LWK envelhece. O saldo segue
 * correto (é lido do cache), mas `last_sync_ok_at` congela e a UI passa a avisar
 * "saldo pode estar desatualizado". O aviso está CERTO: nada garante que aquele
 * número reflita a rede.
 *
 * Este serviço faz só a metade que interessa: sincroniza, sem detectar depósito.
 */
import { logger } from "@/lib/logger";
import { syncWallet } from "@/lib/services/lwk-service";
import { listWalletsWithLwkCache } from "@/server/services/depix-cache-integrity.service";

/**
 * Teto de tempo da rodada inteira.
 *
 * O cron que hospeda esta rotina roda a cada 10min e tem outras tarefas; um sync
 * de ~70s por carteira estoura rápido. Ao bater o teto, o que sobrou fica para a
 * próxima rodada em vez de atrasar o resto do cron.
 */
const ROUND_BUDGET_MS = 4 * 60 * 1000;

export interface WalletSyncSummary {
  total: number;
  synced: number;
  failed: number;
  skipped: number;
}

/**
 * Sincroniza as carteiras, em ordem, até o orçamento da rodada acabar.
 *
 * Nunca lança: é best-effort pendurado num cron. Falha de uma carteira não
 * impede as seguintes, e o que não coube é REPORTADO — nada de truncar em
 * silêncio e parecer que cobriu tudo.
 */
export async function syncWalletsPeriodically(
  nowMs: number = Date.now(),
): Promise<WalletSyncSummary> {
  const summary: WalletSyncSummary = { total: 0, synced: 0, failed: 0, skipped: 0 };

  let tenantIds: string[];
  try {
    tenantIds = await listWalletsWithLwkCache();
  } catch (err) {
    logger.warn("[wallet-sync] nao deu pra listar carteiras", {
      err: err instanceof Error ? err.message : String(err),
    });
    return summary;
  }

  summary.total = tenantIds.length;
  if (tenantIds.length === 0) return summary;

  const deadline = nowMs + ROUND_BUDGET_MS;

  for (const [index, tenantId] of tenantIds.entries()) {
    if (Date.now() >= deadline) {
      summary.skipped = tenantIds.length - index;
      logger.warn("[wallet-sync] orcamento da rodada esgotado — resto fica pra proxima", {
        skipped: summary.skipped,
        synced: summary.synced,
        total: summary.total,
      });
      break;
    }

    const res = await syncWallet(tenantId);
    if (res.success) {
      summary.synced += 1;
    } else {
      summary.failed += 1;
      logger.warn("[wallet-sync] sync falhou", { tenantId, error: res.error });
    }
  }

  return summary;
}
