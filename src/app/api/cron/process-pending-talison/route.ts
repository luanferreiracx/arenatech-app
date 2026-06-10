import { NextRequest, NextResponse } from "next/server"
import { withAdmin } from "@/server/db"
import { logger } from "@/lib/logger"
import { timingSafeEqualString } from "@/lib/utils/timing-safe"
import { processConversation } from "@/lib/talison/runner"
import { recordTalisonMetric } from "@/lib/talison/metrics"

export const dynamic = "force-dynamic"

/**
 * Cron: rede de captura do Talison.
 *
 * O agendamento normal é um setTimeout em memória (debounce de rajada). Se o
 * processo reinicia na janela (deploy) ou o processamento falha, aquele disparo
 * se perde e o cliente fica sem resposta. Este cron varre conversas com mensagem
 * do cliente AINDA pendente (status BOT_ACTIVE, última msg do cliente, já passou
 * o debounce) e reprocessa. processConversation revalida o estado, então é
 * seguro: se a conversa já foi respondida, ele pula.
 *
 * GRACE_MINUTES > debounce evita corrida com um timer que ainda vai disparar.
 */
const GRACE_MINUTES = Number(process.env.TALISON_CATCHUP_GRACE_MINUTES ?? 3)
const MAX_AGE_HOURS = Number(process.env.TALISON_CATCHUP_MAX_AGE_HOURS ?? 6)
const BATCH = Number(process.env.TALISON_CATCHUP_BATCH ?? 20)

export async function POST(request: NextRequest) {
  const expectedSecret = process.env.CRON_SECRET
  if (!expectedSecret) {
    logger.error("[cron] CRON_SECRET not configured")
    return NextResponse.json({ error: "Cron secret not configured" }, { status: 500 })
  }
  if (!timingSafeEqualString(request.headers.get("authorization") ?? "", `Bearer ${expectedSecret}`)) {
    logger.warn("[cron] Unauthorized cron attempt (process-pending-talison)")
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const now = Date.now()
  const upperCutoff = new Date(now - GRACE_MINUTES * 60 * 1000)
  const lowerCutoff = new Date(now - MAX_AGE_HOURS * 60 * 60 * 1000)

  try {
    const candidates = await withAdmin((tx) =>
      tx.chatbotConversation.findMany({
        where: {
          status: "BOT_ACTIVE",
          lastMessageAt: { lt: upperCutoff, gt: lowerCutoff },
        },
        select: {
          id: true,
          tenantId: true,
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { senderType: true },
          },
        },
        orderBy: { lastMessageAt: "asc" },
        take: BATCH,
      }),
    )

    // Só as que têm o cliente esperando (última msg do cliente).
    const pending = candidates.filter((c) => c.messages[0]?.senderType === "customer")

    let processed = 0
    let replied = 0
    for (const conv of pending) {
      try {
        const result = await processConversation(conv.tenantId, conv.id)
        processed++
        if (result.status === "replied") {
          replied++
          recordTalisonMetric("catchup_replied", { conversationId: conv.id })
        }
      } catch (error) {
        logger.error("[cron] catch-up Talison falhou", {
          conversationId: conv.id,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    if (replied > 0) {
      logger.info(`[cron] Talison catch-up respondeu ${replied}/${pending.length} conversas perdidas`)
    }
    return NextResponse.json({ candidates: candidates.length, pending: pending.length, processed, replied })
  } catch (error) {
    logger.error("[cron] Failed to process pending Talison conversations", { error })
    return NextResponse.json(
      { error: "Failed", message: error instanceof Error ? error.message : "Unknown" },
      { status: 500 },
    )
  }
}
