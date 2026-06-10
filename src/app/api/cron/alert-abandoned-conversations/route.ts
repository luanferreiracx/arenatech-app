import { NextRequest, NextResponse } from "next/server"
import { withAdmin } from "@/server/db"
import { logger } from "@/lib/logger"
import { timingSafeEqualString } from "@/lib/utils/timing-safe"
import { sendGroupMessage } from "@/lib/services/whatsapp-service"
import { recordTalisonMetric } from "@/lib/talison/metrics"

export const dynamic = "force-dynamic"

/**
 * Cron: alerta conversas abandonadas.
 *
 * Quando uma conversa está OPEN (atendente no caso) mas o cliente mandou a
 * última mensagem e ninguém respondeu há ALERT_MINUTES, o bot cala (segue o
 * status do Chatwoot) — e o cliente fica esperando. Antes essas conversas
 * "morriam em silêncio". Aqui avisamos o time num grupo do WhatsApp pra alguém
 * assumir. Dedup por metadata.abandonedAlertedAt vs lastMessageAt: re-alerta só
 * quando chega mensagem nova depois do último alerta.
 */
const ALERT_MINUTES = Number(process.env.TALISON_ABANDONED_ALERT_MINUTES ?? 15)
const MAX_AGE_HOURS = Number(process.env.TALISON_ABANDONED_MAX_AGE_HOURS ?? 24)
const ALERT_GROUP_JID = process.env.TALISON_ALERT_GROUP_JID
const ALERT_INSTANCE = process.env.TALISON_ALERT_INSTANCE

function isAlertedAfter(metadata: unknown, since: Date): boolean {
  if (metadata && typeof metadata === "object" && "abandonedAlertedAt" in metadata) {
    const value = (metadata as Record<string, unknown>).abandonedAlertedAt
    if (typeof value === "string") {
      const at = new Date(value)
      return !Number.isNaN(at.getTime()) && at >= since
    }
  }
  return false
}

export async function POST(request: NextRequest) {
  const expectedSecret = process.env.CRON_SECRET
  if (!expectedSecret) {
    logger.error("[cron] CRON_SECRET not configured")
    return NextResponse.json({ error: "Cron secret not configured" }, { status: 500 })
  }
  if (!timingSafeEqualString(request.headers.get("authorization") ?? "", `Bearer ${expectedSecret}`)) {
    logger.warn("[cron] Unauthorized cron attempt (alert-abandoned-conversations)")
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!ALERT_GROUP_JID) {
    logger.warn("[cron] TALISON_ALERT_GROUP_JID ausente — alerta desativado")
    return NextResponse.json({ alerted: 0, skipped: "no group configured" })
  }

  const now = Date.now()
  const upperCutoff = new Date(now - ALERT_MINUTES * 60 * 1000) // mais antigo que isso = elegível
  const lowerCutoff = new Date(now - MAX_AGE_HOURS * 60 * 60 * 1000) // ignora conversas antigas demais

  try {
    const candidates = await withAdmin((tx) =>
      tx.chatbotConversation.findMany({
        where: {
          status: "OPEN",
          lastMessageAt: { lt: upperCutoff, gt: lowerCutoff },
        },
        select: {
          id: true,
          contactName: true,
          contactPhone: true,
          externalId: true,
          lastMessageAt: true,
          metadata: true,
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { senderType: true, content: true },
          },
        },
        take: 50,
      }),
    )

    let alerted = 0
    for (const conv of candidates) {
      const last = conv.messages[0]
      // Só alerta se quem falou por último foi o cliente (está esperando resposta).
      if (!last || last.senderType !== "customer") continue
      // Dedup: já alertamos depois da última mensagem? Então não repete.
      if (conv.lastMessageAt && isAlertedAfter(conv.metadata, conv.lastMessageAt)) continue

      const who = conv.contactName?.trim() || conv.contactPhone
      const preview = (last.content ?? "").replace(/\s+/g, " ").slice(0, 180)
      const waitedMin = conv.lastMessageAt
        ? Math.round((now - conv.lastMessageAt.getTime()) / 60000)
        : ALERT_MINUTES
      const text =
        `⚠️ *Cliente sem resposta há ~${waitedMin}min*\n\n` +
        `👤 ${who}\n` +
        `💬 "${preview}"\n\n` +
        `A conversa está aberta no Chatwoot e o cliente está aguardando um atendente.`

      const result = await sendGroupMessage(ALERT_GROUP_JID, text, {
        instanceName: ALERT_INSTANCE,
      })
      if (!result.success) {
        logger.error("[cron] Falha ao alertar conversa abandonada", {
          conversationId: conv.id,
          error: result.error,
        })
        continue
      }

      // Marca o alerta pra não repetir até chegar mensagem nova.
      const baseMeta =
        conv.metadata && typeof conv.metadata === "object"
          ? (conv.metadata as Record<string, unknown>)
          : {}
      await withAdmin((tx) =>
        tx.chatbotConversation.update({
          where: { id: conv.id },
          data: { metadata: { ...baseMeta, abandonedAlertedAt: new Date().toISOString() } },
        }),
      )
      recordTalisonMetric("abandoned_alert", { conversationId: conv.id, waitedMin })
      alerted++
    }

    logger.info(`[cron] Alertadas ${alerted} conversas abandonadas (>${ALERT_MINUTES}min)`)
    return NextResponse.json({ alerted, candidates: candidates.length })
  } catch (error) {
    logger.error("[cron] Failed to alert abandoned conversations", { error })
    return NextResponse.json(
      { error: "Failed", message: error instanceof Error ? error.message : "Unknown" },
      { status: 500 },
    )
  }
}
