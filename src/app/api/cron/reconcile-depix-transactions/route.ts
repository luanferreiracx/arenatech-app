import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { timingSafeEqualString } from "@/lib/utils/timing-safe";
import { reconcileStaleDepixTransactions } from "@/server/services/depix-transaction.service";

export const dynamic = "force-dynamic";

/**
 * POST /api/cron/reconcile-depix-transactions
 *
 * Reconcilia transacoes DePix presas em PENDING/PROCESSING (saque que ja
 * completou no provedor mas cuja tela nunca foi aberta; deposito cujo PIX
 * expirou). Sem isto, um saque concluido fica reservando saldo pra sempre
 * (saldo disponivel = on-chain - saques pendentes) e bloqueia novos saques.
 *
 * Poll do provedor (LiquidX/PixPay) por transacao, reusando checkTransactionStatus.
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
    const result = await reconcileStaleDepixTransactions();
    logger.info("[cron-reconcile-depix] processed", result);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    logger.error("[cron-reconcile-depix] failed", {
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
