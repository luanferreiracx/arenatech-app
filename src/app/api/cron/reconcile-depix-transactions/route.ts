import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { timingSafeEqualString } from "@/lib/utils/timing-safe";
import { withCronLock } from "@/server/cron-lock";
import { reconcileStaleDepixTransactions } from "@/server/services/depix-transaction.service";
import { expireStalePaymentLinks } from "@/server/services/payment-link.service";

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
