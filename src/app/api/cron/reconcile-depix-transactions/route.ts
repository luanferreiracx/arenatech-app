import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { timingSafeEqualString } from "@/lib/utils/timing-safe";
import { withCronLock } from "@/server/cron-lock";
import {
  reconcileStaleDepixTransactions,
  resolveIndeterminateWithdrawals,
} from "@/server/services/depix-transaction.service";
import { expireStalePaymentLinks } from "@/server/services/payment-link.service";
import { getEsploraHealth } from "@/lib/services/lwk-service";
import { evaluateEsploraHealth } from "@/lib/services/esplora-health-alert";
import { checkCentralLbtcRunway } from "@/server/services/depix-lbtc-refill.service";
import { checkWalletCachesAndAlert } from "@/server/services/depix-cache-integrity.service";
import { expireStaleWithdrawAuthorizations } from "@/server/services/depix-withdraw-authorization.service";

/**
 * Monitora a saúde das Esploras do LWK e alerta (logger.error → Sentry) quando
 * elas estão mudas há tempo demais — ANTES do próximo timeout de webhook Eulen.
 * As Esploras públicas já morreram 2x. Roda de carona no cron de reconcile.
 */
async function checkEsploraHealth(): Promise<void> {
  try {
    const health = await getEsploraHealth();
    const alert = evaluateEsploraHealth(health, Date.now());
    if (alert) {
      logger.error("[esplora-health] Esploras do LWK degradadas — cross-check do webhook vai falhar", {
        reason: alert.reason,
        ...alert.detail,
      });
    }
  } catch (err) {
    // Nunca derruba o cron por causa do check de saúde (best-effort).
    logger.warn("[esplora-health] check falhou", {
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

export const dynamic = "force-dynamic";

/**
 * POST /api/cron/reconcile-depix-transactions
 *
 * Reconcilia transacoes DePix presas em PENDING/PROCESSING (saque que ja
 * completou no provedor mas cuja tela nunca foi aberta; deposito cujo PIX
 * expirou). Sem isto, um saque concluido fica reservando saldo pra sempre
 * (saldo disponivel = on-chain - saques pendentes) e bloqueia novos saques.
 *
 * Poll do provedor (PixPay) por transacao, reusando checkTransactionStatus.
 * Sugerido a cada ~10 min. Sem auth de tenant — roda via withAdmin (cross-tenant).
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const expectedSecret = process.env.CRON_SECRET;

  if (!expectedSecret) {
    logger.error("[cron-reconcile-depix] CRON_SECRET not configured");
    return NextResponse.json({ error: "Cron secret not configured" }, { status: 500 });
  }
  if (!timingSafeEqualString(authHeader ?? "", `Bearer ${expectedSecret}`)) {
    logger.warn("[cron-reconcile-depix] Unauthorized cron attempt");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const results: Awaited<ReturnType<typeof reconcileStaleDepixTransactions>>[] = [];
    let expiredLinks = 0;
    let expiredAuthorizations = 0;
    let indeterminate: Awaited<ReturnType<typeof resolveIndeterminateWithdrawals>> = {
      checked: 0,
      resolved: 0,
    };
    // Lock por job: evita duas instancias consultando/transicionando a mesma tx.
    const ran = await withCronLock("reconcile-depix-transactions", async () => {
      results.push(await reconcileStaleDepixTransactions());
      // Aproveita o mesmo job pra expirar links de pagamento vencidos (12h).
      expiredLinks = (await expireStalePaymentLinks()).expired;
      // ...e pra alertar ANTES de o L-BTC da central secar (gás dos repasses/saques).
      await checkCentralLbtcRunway();
      // ...e pra detectar cache do LWK com UTXOs gastos (saldo inflado — guard de
      // recorrência do incidente 2026-07), em TODAS as carteiras, não só na
      // central. Best-effort: nunca lança.
      await checkWalletCachesAndAlert();
      // ...e, POR ÚLTIMO, pra vigiar a saúde das Esploras do LWK.
      // A ordem importa: são as consultas de saldo acima que mandam o LWK
      // sincronizar e carimbar `last_sync_ok_at`. Checar antes delas lia sempre o
      // carimbo do ciclo anterior — 10 min de idade em 100% das execuções.
      await checkEsploraHealth();
      // ...e pra descobrir se saques INDETERMINADOS (resposta do LWK perdida no
      // timeout) chegaram a ser transmitidos — consulta read-only da chave de
      // idempotência. Sem isto o operador fica sem saber se o dinheiro saiu, que
      // foi o que gerou o pagamento em dobro no TXW20260727-00002.
      indeterminate = await resolveIndeterminateWithdrawals();
      // ...e pra caducar pedido de saque da API que ninguém decidiu. Pedido
      // velho numa fila de dinheiro é ruído perigoso: quem autoriza dois dias
      // depois já não lembra do contexto que o gerou.
      expiredAuthorizations = (await expireStaleWithdrawAuthorizations()).expired;
    });
    const result = results[0];
    if (!ran || !result) return NextResponse.json({ skipped: "locked" });
    logger.info("[cron-reconcile-depix] processed", {
      ...result,
      expiredLinks,
      expiredAuthorizations,
      indeterminate,
    });
    return NextResponse.json({
      success: true,
      ...result,
      expiredLinks,
      expiredAuthorizations,
      indeterminate,
    });
  } catch (err) {
    logger.error("[cron-reconcile-depix] failed", {
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
