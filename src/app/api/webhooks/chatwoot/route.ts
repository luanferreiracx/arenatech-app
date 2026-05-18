import { NextRequest, NextResponse } from "next/server"
import { withAdmin } from "@/server/db"
import { logger } from "@/lib/logger"

/**
 * POST /api/webhooks/chatwoot
 *
 * Chatwoot webhook receiver — handles incoming messages and conversation events.
 * Faithful to Laravel ChatbotController::handle().
 *
 * Events handled:
 * - message_created (incoming) → create ChatbotMessage + update conversation
 * - conversation_status_changed → update conversation status
 * - conversation_resolved → mark as resolved
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as Record<string, unknown>
    const event = String(body.event ?? "")

    logger.info("Chatwoot webhook received", { event })

    // Verify webhook token
    const token = req.headers.get("x-chatwoot-signature") ?? req.headers.get("authorization")
    const expectedToken = process.env.CHATWOOT_WEBHOOK_TOKEN
    if (expectedToken && token !== expectedToken && token !== `Bearer ${expectedToken}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Determine tenant from account (Chatwoot account maps to tenant)
    const account = body.account as Record<string, unknown> | undefined
    const accountId = String(account?.id ?? "")

    // For now, use global admin context to find tenant by Chatwoot account
    // In production, this would be mapped via a config table
    const tenantId = process.env.DEFAULT_TENANT_ID

    if (!tenantId) {
      logger.warn("Chatwoot webhook: no tenant mapping", { accountId })
      return NextResponse.json({ ok: true })
    }

    switch (event) {
      case "message_created": {
        const message = body.content as string | undefined
        const messageType = String(body.message_type ?? "")
        const sender = body.sender as Record<string, unknown> | undefined
        const conversation = body.conversation as Record<string, unknown> | undefined

        if (!message || !conversation) break

        const isIncoming = messageType === "incoming"
        const meta = (conversation as Record<string, unknown>)?.meta as Record<string, unknown> | undefined
        const metaSender = meta?.sender as Record<string, unknown> | undefined
        const contactPhone = String(
          (sender as Record<string, unknown>)?.phone_number ??
          metaSender?.phone_number ??
          ""
        ).replace(/\D/g, "")
        const contactName = String(sender?.name ?? "")
        const externalConvId = String(conversation?.id ?? "")

        if (!contactPhone) break

        await withAdmin(async (tx) => {
          // Find or create conversation
          let conv = await tx.chatbotConversation.findFirst({
            where: { tenantId, contactPhone },
          })

          if (!conv) {
            conv = await tx.chatbotConversation.create({
              data: {
                tenantId,
                externalId: externalConvId,
                contactPhone,
                contactName: contactName || null,
                status: "OPEN",
                lastMessageAt: new Date(),
              },
            })
          }

          // Create message
          await tx.chatbotMessage.create({
            data: {
              tenantId,
              conversationId: conv.id,
              direction: isIncoming ? "incoming" : "outgoing",
              senderType: isIncoming ? "customer" : (String(sender?.type ?? "") === "contact" ? "customer" : "agent"),
              content: message,
              contentType: String(body.content_type ?? "text"),
              externalId: String(body.id ?? ""),
            },
          })

          // Update conversation timestamp
          await tx.chatbotConversation.update({
            where: { id: conv.id },
            data: {
              lastMessageAt: new Date(),
              contactName: contactName || conv.contactName,
              externalId: externalConvId || conv.externalId,
            },
          })
        })
        break
      }

      case "conversation_status_changed":
      case "conversation_resolved": {
        const conversation = body.conversation as Record<string, unknown> | undefined
        const status = String(conversation?.status ?? body.status ?? "")
        const externalId = String(conversation?.id ?? "")

        if (!externalId) break

        await withAdmin(async (tx) => {
          const conv = await tx.chatbotConversation.findFirst({
            where: { tenantId, externalId },
          })
          if (!conv) return

          if (status === "resolved" || event === "conversation_resolved") {
            await tx.chatbotConversation.update({
              where: { id: conv.id },
              data: { status: "RESOLVED", resolvedAt: new Date() },
            })
            // Cancel pending follow-ups
            await tx.chatbotFollowUp.updateMany({
              where: { conversationId: conv.id, cancelled: false, executedAt: null },
              data: { cancelled: true },
            })
          } else if (status === "open") {
            await tx.chatbotConversation.update({
              where: { id: conv.id },
              data: { status: "OPEN", resolvedAt: null },
            })
          }
        })
        break
      }

      default:
        logger.debug("Chatwoot webhook: unhandled event", { event })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    logger.error("Chatwoot webhook error", {
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
