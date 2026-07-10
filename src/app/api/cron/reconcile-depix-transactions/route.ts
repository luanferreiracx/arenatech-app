import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { timingSafeEqualString } from "@/lib/utils/timing-safe";
import { withCronLock } from "@/server/cron-lock";
import { reconcileStaleDepixTransactions } from "@/server/services/depix-transaction.service";
import { expireStalePaymentLinks } from "@/server/services/payment-link.service";
import { getEsploraHealth } from "@/lib/services/lwk-service";
import { evaluateEsploraHealth } from "@/lib/services/esplora-health-alert";

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
    // Lock por job: evita duas instancias consultando/transicionando a mesma tx.
    const ran = await withCronLock("reconcile-depix-transactions", async () => {
      results.push(await reconcileStaleDepixTransactions());
      // Aproveita o mesmo job pra expirar links de pagamento vencidos (12h).
      expiredLinks = (await expireStalePaymentLinks()).expired;
      // ...e pra vigiar a saúde das Esploras do LWK (alerta antecipado).
      await checkEsploraHealth();
    });
    const result = results[0];
    if (!ran || !result) return NextResponse.json({ skipped: "locked" });
    logger.info("[cron-reconcile-depix] processed", { ...result, expiredLinks });
    return NextResponse.json({ success: true, ...result, expiredLinks });
  } catch (err) {
    logger.error("[cron-reconcile-depix] failed", {
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
