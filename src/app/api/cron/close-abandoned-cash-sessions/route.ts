import { NextRequest, NextResponse } from "next/server"
import { autoCloseAbandonedSessions } from "@/server/services/cash-session.service"
import { withAdmin } from "@/server/db"
import { logger } from "@/lib/logger"
import { timingSafeEqualString } from "@/lib/utils/timing-safe"

export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization")
  const expectedSecret = process.env.CRON_SECRET

  if (!expectedSecret) {
    logger.error("[cron] CRON_SECRET not configured")
    return NextResponse.json(
      { error: "Cron secret not configured" },
      { status: 500 }
    )
  }

  if (!timingSafeEqualString(authHeader ?? "", `Bearer ${expectedSecret}`)) {
    logger.warn("[cron] Unauthorized cron attempt")
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    // Cron global cross-tenant (fecha caixas abandonados de TODOS os tenants)
    // -> withAdmin (role app_admin, BYPASSRLS). Com o runtime como app_login
    // (sujeito a RLS), o client cru nao enxergaria sessao de nenhum tenant.
    const result = await withAdmin((tx) => autoCloseAbandonedSessions(tx as any))
    logger.info(`[cron] Auto-closed ${result.closedCount} abandoned cash sessions`, { sessions: result.sessions })
    return NextResponse.json(result)
  } catch (error) {
    logger.error("[cron] Failed to auto-close sessions", { error })
    return NextResponse.json(
      { error: "Failed to auto-close sessions", message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
