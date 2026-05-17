import { NextRequest, NextResponse } from "next/server"
import { autoCloseAbandonedSessions } from "@/server/services/cash-session.service"
import { prisma } from "@/server/db"
import { logger } from "@/lib/logger"

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

  if (authHeader !== `Bearer ${expectedSecret}`) {
    logger.warn("[cron] Unauthorized cron attempt")
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const result = await autoCloseAbandonedSessions(prisma as any)
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
