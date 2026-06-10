import { NextRequest, NextResponse } from "next/server"
import type { Prisma } from "@prisma/client"
import { withAdmin } from "@/server/db"
import { logger } from "@/lib/logger"
import { timingSafeEqualString } from "@/lib/utils/timing-safe"
import { sendGroupMessage } from "@/lib/services/whatsapp-service"
import { sendBotMessage } from "@/lib/talison/chatwoot-client"
import { isStoreOpen, businessHoursLabel } from "@/lib/talison/business-hours"
import { isCustomerWaitingReply } from "@/lib/talison/intent"
import { recordTalisonMetric } from "@/lib/talison/metrics"

export const dynamic = "force-dynamic"

/**
 * Cron: varredura de conversas em espera (rodar a cada 1 min — systemd no VPS).
 *
 * Para conversas OPEN onde o cliente mandou a última mensagem e nenhum atendente
 * humano respondeu (conversa "abandonada"):
 *  - DENTRO do horário (seg–sáb 09:30–20:00):
 *      • aos 10 min → alerta o time no grupo do WhatsApp;
 *      • a partir de 20 min → a cada 5 min envia uma mensagem fixa (sem IA)
 *        pedindo paciência, até um humano assumir ou o cliente escrever de novo.
 *  - FORA do horário: informa uma vez que estamos fechados e que um atendente
 *    retorna no horário.
 *
 * "Humano respondeu" = ChatbotMessage senderType "agent". A mensagem fixa é salva
 * como "bot", então não conta como humano (e o eco é deduplicado pelo webhook).
 * Os flags ficam em conversation.metadata e resetam quando chega msg nova do
 * cliente (comparados com a data da última msg do cliente).
 */
const ALERT_MINUTES = Number(process.env.TALISON_ABANDONED_ALERT_MINUTES ?? 10)
const WAIT_MSG_AFTER_MINUTES = Number(process.env.TALISON_WAIT_MSG_AFTER_MINUTES ?? 20)
const WAIT_MSG_INTERVAL_MINUTES = Number(process.env.TALISON_WAIT_MSG_INTERVAL_MINUTES ?? 5)
// Quantas vezes no máximo mandar a mensagem fixa de espera antes de parar
// (decisão do dono): evita ficar incomodando indefinidamente.
const WAIT_MSG_MAX = Number(process.env.TALISON_WAIT_MSG_MAX ?? 2)
const MAX_AGE_HOURS = Number(process.env.TALISON_WAIT_MAX_AGE_HOURS ?? 24)
const BATCH = Number(process.env.TALISON_WAIT_BATCH ?? 60)
const ALERT_GROUP_JID = process.env.TALISON_ALERT_GROUP_JID
const ALERT_INSTANCE = process.env.TALISON_ALERT_INSTANCE

const WAIT_MESSAGE =
  "Desculpe, nossos atendentes estão indisponíveis no momento, provavelmente ocupados " +
  "com o atendimento na loja física. Lamentamos o inconveniente, por favor, aguarde...."

function offHoursMessage(config: { start?: string | null; end?: string | null }): string {
  return (
    `No momento estamos fora do horário de atendimento (${businessHoursLabel(config)}). ` +
    "Assim que retornarmos, um atendente humano vai te responder por aqui. Obrigado pela paciência! 😊"
  )
}

function metaDate(metadata: unknown, key: string): Date | null {
  if (metadata && typeof metadata === "object" && key in metadata) {
    const value = (metadata as Record<string, unknown>)[key]
    if (typeof value === "string") {
      const at = new Date(value)
      return Number.isNaN(at.getTime()) ? null : at
    }
  }
  return null
}

/** Envia mensagem visível ao cliente E persiste como "bot" (não conta como humano; dedup do eco). */
async function sendCustomerMessage(
  tenantId: string,
  conversationId: string,
  externalId: string | null,
  content: string,
): Promise<void> {
  await withAdmin((tx) =>
    tx.chatbotMessage.create({
      data: {
        tenantId,
        conversationId,
        direction: "outgoing",
        senderType: "bot",
        content,
        contentType: "text",
      },
    }),
  )
  if (externalId) await sendBotMessage(externalId, content)
}

export async function POST(request: NextRequest) {
  const expectedSecret = process.env.CRON_SECRET
  if (!expectedSecret) {
    logger.error("[cron] CRON_SECRET not configured")
    return NextResponse.json({ error: "Cron secret not configured" }, { status: 500 })
  }
  if (!timingSafeEqualString(request.headers.get("authorization") ?? "", `Bearer ${expectedSecret}`)) {
    logger.warn("[cron] Unauthorized cron attempt (talison-waiting-sweep)")
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const now = Date.now()
  const lowerCutoff = new Date(now - MAX_AGE_HOURS * 60 * 60 * 1000)

  try {
    const candidates = await withAdmin((tx) =>
      tx.chatbotConversation.findMany({
        where: { status: "OPEN", lastMessageAt: { gt: lowerCutoff } },
        select: {
          id: true,
          tenantId: true,
          externalId: true,
          contactName: true,
          contactPhone: true,
          metadata: true,
          messages: {
            orderBy: { createdAt: "desc" },
            take: 15,
            select: { senderType: true, content: true, createdAt: true },
          },
        },
        orderBy: { lastMessageAt: "asc" },
        take: BATCH,
      }),
    )

    // Cache de config por tenant (horário de funcionamento).
    const configByTenant = new Map<string, { start?: string | null; end?: string | null }>()
    async function configFor(tenantId: string) {
      const cached = configByTenant.get(tenantId)
      if (cached) return cached
      const cfg = await withAdmin((tx) =>
        tx.chatbotConfig.findUnique({
          where: { tenantId },
          select: { businessHoursStart: true, businessHoursEnd: true },
        }),
      )
      const value = { start: cfg?.businessHoursStart ?? null, end: cfg?.businessHoursEnd ?? null }
      configByTenant.set(tenantId, value)
      return value
    }

    let alerted = 0
    let waitMsgs = 0
    let offHoursMsgs = 0

    let alertedSkippedClosed = 0

    for (const conv of candidates) {
      const lastCustomer = conv.messages.find((m) => m.senderType === "customer")?.createdAt ?? null
      const lastAgent = conv.messages.find((m) => m.senderType === "agent")?.createdAt ?? null
      if (!lastCustomer) continue
      // Humano respondeu depois do cliente → está atendendo, não mexe.
      if (lastAgent && lastAgent > lastCustomer) continue

      const waitedMin = (now - lastCustomer.getTime()) / 60000
      // Só faz sentido agir a partir do 1º marco (alerta aos 10min). Antes disso,
      // nem classifica (poupa chamada de LLM).
      if (waitedMin < ALERT_MINUTES) continue

      const lastCustomerIso = lastCustomer.toISOString()
      const baseMeta =
        conv.metadata && typeof conv.metadata === "object"
          ? (conv.metadata as Record<string, unknown>)
          : {}
      const patch: Record<string, unknown> = {}

      // GATE DE INTENÇÃO (decisão do dono): só alerta/naga se a IA disser que o
      // cliente está MESMO aguardando — não quando ele só encerrou ("ok",
      // "obrigado", "tô a caminho"). Decisão cacheada por mensagem do cliente
      // (não reclassifica a cada minuto).
      let waiting: boolean
      if (baseMeta.waitingDecisionAt === lastCustomerIso && typeof baseMeta.waiting === "boolean") {
        waiting = baseMeta.waiting
      } else {
        const transcript = conv.messages
          .slice(0, 5)
          .reverse()
          .map((m) => `${m.senderType === "customer" ? "Cliente" : "Loja"}: ${(m.content ?? "").slice(0, 200)}`)
          .join("\n")
        waiting = await isCustomerWaitingReply(transcript)
        patch.waitingDecisionAt = lastCustomerIso
        patch.waiting = waiting
      }

      if (!waiting) {
        alertedSkippedClosed++
        recordTalisonMetric("wait_skipped_closed", { conversationId: conv.id })
        if (Object.keys(patch).length > 0) {
          await withAdmin((tx) =>
            tx.chatbotConversation.update({
              where: { id: conv.id },
              data: { metadata: { ...baseMeta, ...patch } as Prisma.InputJsonValue },
            }),
          )
        }
        continue
      }

      const config = await configFor(conv.tenantId)
      const open = isStoreOpen(config)

      if (!open) {
        // Fora do horário: avisa uma vez (reseta quando o cliente escreve de novo).
        const notified = metaDate(conv.metadata, "offHoursNotifiedAt")
        if (!notified || notified < lastCustomer) {
          await sendCustomerMessage(conv.tenantId, conv.id, conv.externalId, offHoursMessage(config))
          patch.offHoursNotifiedAt = new Date().toISOString()
          offHoursMsgs++
          recordTalisonMetric("off_hours_notice", { conversationId: conv.id })
        }
      } else {
        // Dentro do horário: alerta no grupo aos 10 min.
        if (ALERT_GROUP_JID) {
          const alertedAt = metaDate(conv.metadata, "abandonedAlertedAt")
          if (!alertedAt || alertedAt < lastCustomer) {
            const who = conv.contactName?.trim() || conv.contactPhone
            const last = conv.messages.find((m) => m.senderType === "customer")
            const preview = (last?.content ?? "").replace(/\s+/g, " ").slice(0, 180)
            const text =
              `⚠️ *Cliente sem resposta há ~${Math.round(waitedMin)}min*\n\n` +
              `👤 ${who}\n💬 "${preview}"\n\n` +
              "Conversa aberta no Chatwoot, cliente aguardando atendente."
            const sent = await sendGroupMessage(ALERT_GROUP_JID, text, { instanceName: ALERT_INSTANCE })
            if (sent.success) {
              patch.abandonedAlertedAt = new Date().toISOString()
              alerted++
              recordTalisonMetric("abandoned_alert", { conversationId: conv.id, waitedMin: Math.round(waitedMin) })
            }
          }
        }

        // A partir de 20 min: mensagem fixa de espera a cada 5 min, NO MÁXIMO
        // WAIT_MSG_MAX vezes (depois para — fica só o alerta no grupo).
        if (waitedMin >= WAIT_MSG_AFTER_MINUTES) {
          const cycleAt = typeof baseMeta.waitCountAt === "string" ? baseMeta.waitCountAt : null
          const count = cycleAt === lastCustomerIso && typeof baseMeta.waitCount === "number" ? baseMeta.waitCount : 0
          const lastWait = metaDate(conv.metadata, "waitMsgLastAt")
          const intervalDue =
            !lastWait || lastWait < lastCustomer || now - lastWait.getTime() >= WAIT_MSG_INTERVAL_MINUTES * 60000
          if (count < WAIT_MSG_MAX && intervalDue) {
            await sendCustomerMessage(conv.tenantId, conv.id, conv.externalId, WAIT_MESSAGE)
            patch.waitMsgLastAt = new Date().toISOString()
            patch.waitCount = count + 1
            patch.waitCountAt = lastCustomerIso
            waitMsgs++
            recordTalisonMetric("wait_message", { conversationId: conv.id, n: count + 1 })
          }
        }
      }

      if (Object.keys(patch).length > 0) {
        await withAdmin((tx) =>
          tx.chatbotConversation.update({
            where: { id: conv.id },
            data: { metadata: { ...baseMeta, ...patch } as Prisma.InputJsonValue },
          }),
        )
      }
    }

    if (alerted || waitMsgs || offHoursMsgs || alertedSkippedClosed) {
      logger.info(
        `[cron] Talison waiting-sweep: ${alerted} alertas, ${waitMsgs} msgs espera, ${offHoursMsgs} off-hours, ${alertedSkippedClosed} encerradas (puladas)`,
      )
    }
    return NextResponse.json({ candidates: candidates.length, alerted, waitMsgs, offHoursMsgs, skippedClosed: alertedSkippedClosed })
  } catch (error) {
    logger.error("[cron] talison-waiting-sweep failed", { error })
    return NextResponse.json(
      { error: "Failed", message: error instanceof Error ? error.message : "Unknown" },
      { status: 500 },
    )
  }
}
