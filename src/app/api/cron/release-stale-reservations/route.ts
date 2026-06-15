import { NextRequest, NextResponse } from "next/server"
import { releaseStaleReservations } from "@/server/services/stock-item.service"
import { withAdmin } from "@/server/db"
import { logger } from "@/lib/logger"
import { timingSafeEqualString } from "@/lib/utils/timing-safe"

export const dynamic = "force-dynamic"

/**
 * Libera reservas de StockItem presas (vendedor adicionou ao carrinho e fechou
 * o navegador sem finalizar nem abandonar). Roda a cada 10min. Cross-tenant.
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization")
  const expectedSecret = process.env.CRON_SECRET

  if (!expectedSecret) {
    logger.error("[cron] CRON_SECRET not configured")
    return NextResponse.json({ error: "Cron secret not configured" }, { status: 500 })
  }

  if (!timingSafeEqualString(authHeader ?? "", `Bearer ${expectedSecret}`)) {
    logger.warn("[cron] Unauthorized cron attempt (release-stale-reservations)")
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    // withAdmin (BYPASSRLS): job global cross-tenant — o client runtime sujeito
    // a RLS nao enxergaria reservas de nenhum tenant.
    const result = await withAdmin((tx) => releaseStaleReservations(tx as never))
    logger.info(`[cron] Released ${result.releasedCount} stale stock reservations`)
    return NextResponse.json(result)
  } catch (error) {
    logger.error("[cron] Failed to release stale reservations", { error })
    return NextResponse.json(
      { error: "Failed to release stale reservations", message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    )
  }
}
