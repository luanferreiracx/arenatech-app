import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { timingSafeEqualString } from "@/lib/utils/timing-safe";
import { withCronLock } from "@/server/cron-lock";
import { reconcileEulenDepositsByExtract } from "@/server/services/depix-transaction.service";

export const dynamic = "force-dynamic";

/**
 * POST /api/cron/reconcile-eulen-extract
 *
 * Rede de seguranca de conciliacao por EXTRATO da Eulen (GET /deposits): pega o
 * que o webhook E o monitor LWK perderam (credito de `depix_sent` nunca aplicado,
 * estorno `refunded`/MED nunca registrado). Complementa o cron por-id
 * (reconcile-depix-transactions), que so varre as nossas linhas PENDING/PROCESSING.
 *
 * Sugerido ~1x/h. Cross-tenant (withAdmin). Sem credito as cegas: cada divergencia
 * passa pelo settle canonico (cross-check on-chain) ou marca pendencia MED.
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const expectedSecret = process.env.CRON_SECRET;

  if (!expectedSecret) {
    logger.error("[cron-reconcile-eulen-extract] CRON_SECRET not configured");
    return NextResponse.json({ error: "Cron secret not configured" }, { status: 500 });
  }
  if (!timingSafeEqualString(authHeader ?? "", `Bearer ${expectedSecret}`)) {
    logger.warn("[cron-reconcile-eulen-extract] Unauthorized cron attempt");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const results: Awaited<ReturnType<typeof reconcileEulenDepositsByExtract>>[] = [];
    const ran = await withCronLock("reconcile-eulen-extract", async () => {
      results.push(await reconcileEulenDepositsByExtract());
    });
    const result = results[0];
    if (!ran || !result) return NextResponse.json({ skipped: "locked" });
    logger.info("[cron-reconcile-eulen-extract] processed", { ...result });
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    logger.error("[cron-reconcile-eulen-extract] failed", {
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
