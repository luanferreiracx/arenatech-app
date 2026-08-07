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
 * Dimensionado pelo TIMEOUT DE QUEM CHAMA, não pelo que seria confortável aqui.
 * O systemd invoca o cron com `curl -m 170`; com um sync de ~70s por carteira, um
 * orçamento de 4min (o valor original) estourava o curl antes de a rota responder.
 * O job morria com exit 28, o `last_sync_ok_at` nunca era gravado, e a UI seguia
 * avisando "saldo desatualizado" — o cron rodava e não adiantava nada.
 *
 * 90s deixa ~80s para o resto do cron (reconcile de saque, expiração de links,
 * integridade de cache), que é o trabalho que destrava dinheiro preso e não pode
 * ficar de fora do relógio por causa de uma atualização de carimbo.
 *
 * O `last_sync_ok_at` do LWK é GLOBAL, não por carteira: qualquer sync que
 * complete renova o carimbo que a UI lê. Então 1 carteira por rodada, a cada
 * 10min, já mantém o indicador fresco com folga sobre o limiar de 30min. O anel
 * (ver `startIndex`) cuida de as demais carteiras também terem o cache atualizado
 * ao longo das rodadas, em vez de uma só ser servida para sempre.
 */
const ROUND_BUDGET_MS = 90 * 1000;

export interface WalletSyncSummary {
  total: number;
  synced: number;
  failed: number;
  skipped: number;
}

/** Intervalo nominal do cron; converte relógio em número de rodada pro anel. */
const CRON_INTERVAL_MS = 10 * 60_000;

/**
 * Sincroniza as carteiras até o orçamento da rodada acabar, percorrendo-as em
 * ANEL entre rodadas.
 *
 * O anel é o que impede carteira órfã. Sem ele, com orçamento para ~1 carteira
 * por rodada, a primeira da lista seria sincronizada para sempre e as demais
 * nunca — o cron rodaria a cada 10min dando a impressão de cobertura enquanto
 * três das quatro carteiras envelheciam indefinidamente.
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
  // Ponto de partida gira a cada rodada: quem ficou de fora hoje vem primeiro
  // amanhã. Deriva do relógio (não de estado persistido) para não precisar de
  // tabela nova — a lista tem ordem estável por id, então a posição não muda.
  const startIndex = Math.floor(nowMs / CRON_INTERVAL_MS) % tenantIds.length;

  for (let offset = 0; offset < tenantIds.length; offset += 1) {
    const index = (startIndex + offset) % tenantIds.length;
    const tenantId = tenantIds[index]!;
    if (Date.now() >= deadline) {
      summary.skipped = tenantIds.length - offset;
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
