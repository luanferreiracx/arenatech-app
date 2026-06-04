import { NextRequest, NextResponse } from "next/server"
import { withAdmin } from "@/server/db"
import { logger } from "@/lib/logger"
import { timingSafeEqualString } from "@/lib/utils/timing-safe"

export const dynamic = "force-dynamic"

/**
 * Cron: resolve conversas paradas.
 *
 * Regra (paridade Laravel): conversa sem atividade há STALE_HOURS e ainda não
 * resolvida vira RESOLVED automaticamente. Cliente que voltar depois reabre
 * a conversa (o webhook atende de novo). Cross-tenant via withAdmin.
 */
const STALE_HOURS = Number(process.env.TALISON_STALE_HOURS ?? 12)

export async function POST(request: NextRequest) {
  const expectedSecret = process.env.CRON_SECRET
  if (!expectedSecret) {
    logger.error("[cron] CRON_SECRET not configured")
    return NextResponse.json({ error: "Cron secret not configured" }, { status: 500 })
  }
  if (!timingSafeEqualString(request.headers.get("authorization") ?? "", `Bearer ${expectedSecret}`)) {
    logger.warn("[cron] Unauthorized cron attempt (resolve-stale-conversations)")
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const cutoff = new Date(Date.now() - STALE_HOURS * 60 * 60 * 1000)
    const result = await withAdmin((tx) =>
      tx.chatbotConversation.updateMany({
        where: {
          status: { not: "RESOLVED" },
          lastMessageAt: { lt: cutoff },
        },
        data: { status: "RESOLVED", resolvedAt: new Date() },
      }),
    )
    logger.info(`[cron] Resolvidas ${result.count} conversas paradas (>${STALE_HOURS}h)`)
    return NextResponse.json({ resolvedCount: result.count, staleHours: STALE_HOURS })
  } catch (error) {
    logger.error("[cron] Failed to resolve stale conversations", { error })
    return NextResponse.json(
      { error: "Failed", message: error instanceof Error ? error.message : "Unknown" },
      { status: 500 },
    )
  }
}
