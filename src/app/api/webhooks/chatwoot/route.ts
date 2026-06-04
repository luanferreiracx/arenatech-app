import { NextRequest, NextResponse } from "next/server"
import { withAdmin } from "@/server/db"
import { logger } from "@/lib/logger"
import { timingSafeEqualString } from "@/lib/utils/timing-safe"
import { recordWebhookEvent, extractSourceIp } from "@/lib/webhooks/replay-guard"
import { scheduleTalisonRun } from "@/lib/talison/scheduler"

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

    // Verify webhook token (timing-safe compare contra rotina e contra "Bearer X").
    // Chatwoot Agent Bot não permite header customizado, então também aceitamos
    // o token via query string (?token=...) — é a forma prática de autenticar
    // com o bot. Headers continuam suportados (proxy/nginx que injete auth).
    const token =
      req.headers.get("x-chatwoot-signature") ??
      req.headers.get("authorization") ??
      req.nextUrl.searchParams.get("token") ??
      ""
    const expectedToken = process.env.CHATWOOT_WEBHOOK_TOKEN
    if (!expectedToken) {
      if (process.env.NODE_ENV === "production") {
        logger.error("Chatwoot webhook: CHATWOOT_WEBHOOK_TOKEN ausente em prod — rejeitando.")
        return NextResponse.json({ error: "Service not configured" }, { status: 503 })
      }
      logger.warn("Chatwoot webhook: sem CHATWOOT_WEBHOOK_TOKEN — aceitando em dev")
    } else {
      const okRaw = timingSafeEqualString(token, expectedToken)
      const okBearer = timingSafeEqualString(token, `Bearer ${expectedToken}`)
      if (!okRaw && !okBearer) {
        logger.warn("Chatwoot webhook: invalid token")
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }
    }

    // Determine tenant from account (Chatwoot account maps to tenant).
    // CHATWOOT_ACCOUNT_TENANT_MAP (JSON {accountId: tenantId}) resolve o tenant
    // pelo payload em deploys multi-conta; cai no DEFAULT_TENANT_ID quando nao
    // mapeado (compat com deploy single-tenant atual).
    const account = body.account as Record<string, unknown> | undefined
    const accountId = String(account?.id ?? "")
    const accountTenantMap: Record<string, string> = (() => {
      try {
        return JSON.parse(process.env.CHATWOOT_ACCOUNT_TENANT_MAP ?? "{}") as Record<string, string>
      } catch {
        return {}
      }
    })()
    const tenantId = accountTenantMap[accountId] ?? process.env.DEFAULT_TENANT_ID

    if (!tenantId) {
      logger.warn("Chatwoot webhook: no tenant mapping", { accountId })
      return NextResponse.json({ ok: true })
    }

    switch (event) {
      case "message_created": {
        const message = body.content as string | undefined
        // message_type vem como STRING ("incoming"/"outgoing") no webhook genérico,
        // mas como INTEIRO (0=incoming, 1=outgoing) no Agent Bot. Normaliza ambos.
        const rawMessageType = body.message_type
        const messageType = String(rawMessageType ?? "")
        const sender = body.sender as Record<string, unknown> | undefined
        const conversation = body.conversation as Record<string, unknown> | undefined

        // Attachments do Chatwoot: a primeira mídia traz data_url + file_type.
        // Imagem é desviada ao Claude (visão) no runner; aqui só persistimos.
        const attachments = Array.isArray(body.attachments)
          ? (body.attachments as Array<Record<string, unknown>>)
          : []
        const firstAttachment = attachments[0]
        const mediaUrl = firstAttachment?.data_url ? String(firstAttachment.data_url) : null
        const mediaType = firstAttachment
          ? String(firstAttachment.file_type ?? firstAttachment.type ?? "file")
          : null

        // Aceita mensagem com texto OU com mídia (imagem sem caption é válida).
        if (!conversation || (!message && !mediaUrl)) break

        // Idempotencia: o Chatwoot pode reentregar message_created. Sem guard,
        // um replay criava ChatbotMessage duplicada. Dedup pela id da mensagem.
        const messageId = String(body.id ?? "")
        if (messageId) {
          const isNew = await recordWebhookEvent({
            provider: "chatwoot",
            eventId: `message:${messageId}`,
            eventType: event,
            sourceIp: extractSourceIp(req.headers),
            signatureValid: !!expectedToken,
            payload: body,
          })
          if (!isNew) {
            logger.info("Chatwoot webhook: mensagem duplicada, ignorando", { messageId })
            break
          }
        }

        // incoming = "incoming" (webhook genérico) OU 0 (Agent Bot).
        const isIncoming = messageType === "incoming" || rawMessageType === 0 || messageType === "0"
        const senderType = String(sender?.type ?? "")
        // Sender.type Chatwoot:
        //   - "contact" = cliente (mensagem incoming)
        //   - "user" = agente humano (mensagem outgoing manual)
        //   - "agent_bot" = bot Chatwoot
        const isHumanAgent = !isIncoming && senderType === "user"

        const meta = (conversation as Record<string, unknown>)?.meta as Record<string, unknown> | undefined
        const metaSender = meta?.sender as Record<string, unknown> | undefined
        const contactPhone = String(
          (sender as Record<string, unknown>)?.phone_number ??
          metaSender?.phone_number ??
          ""
        ).replace(/\D/g, "")
        const contactName = String(sender?.name ?? "")
        const externalConvId = String(conversation?.id ?? "")
        const senderUserId = sender?.id ? String(sender.id) : null

        if (!contactPhone) break

        const persisted = await withAdmin(async (tx) => {
          // Lookup customer por telefone (cliente cadastrado)
          // Telefone pode ter prefixos diversos; busca pelos ultimos 8/9 digitos
          const last9 = contactPhone.slice(-9)
          const customer = await tx.customer.findFirst({
            where: {
              tenantId,
              OR: [
                { phone: { contains: last9 } },
                { phoneSecondary: { contains: last9 } },
              ],
            },
            select: { id: true, name: true },
          })

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
                contactName: customer?.name ?? contactName ?? null,
                customerId: customer?.id ?? null,
                status: "OPEN",
                lastMessageAt: new Date(),
              },
            })
          } else if (customer && !conv.customerId) {
            // Conv ja existia mas sem cliente vinculado; vincular agora
            await tx.chatbotConversation.update({
              where: { id: conv.id },
              data: { customerId: customer.id },
            })
          }

          // Create message. Imagem → contentType "image" + mediaUrl (Claude
          // descreve no runner). content guarda a caption ou um placeholder.
          const isImage = mediaType === "image" && !!mediaUrl
          const contentType = isImage
            ? "image"
            : mediaType
              ? mediaType
              : String(body.content_type ?? "text")
          const persistedContent = message?.trim()
            ? message
            : mediaType
              ? `[mídia: ${mediaType}]`
              : ""
          await tx.chatbotMessage.create({
            data: {
              tenantId,
              conversationId: conv.id,
              direction: isIncoming ? "incoming" : "outgoing",
              senderType: isIncoming ? "customer" : (senderType === "user" ? "agent" : "bot"),
              content: persistedContent,
              contentType,
              mediaUrl,
              externalId: String(body.id ?? ""),
            },
          })

          // Detectar bot→humano: se um agente humano respondeu, marcar HUMAN_TAKEOVER
          // e cancelar follow-ups pendentes (paridade Laravel ChatbotController::detectarHandoff).
          if (isHumanAgent && conv.status !== "HUMAN_TAKEOVER" && conv.status !== "RESOLVED") {
            await tx.chatbotConversation.update({
              where: { id: conv.id },
              data: {
                status: "HUMAN_TAKEOVER",
                assignedAgentId: senderUserId ? null : undefined, // Chatwoot user id (nao FK ao User local)
                lastMessageAt: new Date(),
                contactName: contactName || conv.contactName,
                externalId: externalConvId || conv.externalId,
              },
            })
            await tx.chatbotFollowUp.updateMany({
              where: { conversationId: conv.id, cancelled: false, executedAt: null },
              data: { cancelled: true },
            })
          } else {
            // Cliente voltou numa conversa RESOLVIDA = novo atendimento → reabre
            // pro bot. (HUMAN_TAKEOVER não reabre: humano assumiu de propósito.)
            const reopen = isIncoming && conv.status === "RESOLVED"
            await tx.chatbotConversation.update({
              where: { id: conv.id },
              data: {
                lastMessageAt: new Date(),
                contactName: contactName || conv.contactName,
                externalId: externalConvId || conv.externalId,
                ...(reopen ? { status: "OPEN", resolvedAt: null } : {}),
              },
            })
          }

          // Aciona o Talison em mensagem do cliente, exceto quando um humano
          // assumiu (HUMAN_TAKEOVER). RESOLVED não bloqueia: cliente voltando
          // reabre a conversa (acima) e o bot atende o novo contato.
          const triggerBot = isIncoming && !isHumanAgent && conv.status !== "HUMAN_TAKEOVER"
          return { conversationId: conv.id, triggerBot }
        })

        // Fora da tx e sem await bloqueante: agenda o agente e responde 200 já.
        if (persisted?.triggerBot) {
          logger.info("Chatwoot webhook: agendando Talison", { conversationId: persisted.conversationId })
          void scheduleTalisonRun(tenantId, persisted.conversationId)
        } else {
          // Por que NÃO agendou — evita "morrer em silêncio" no diagnóstico.
          logger.info("Chatwoot webhook: Talison não acionado", {
            isIncoming,
            isHumanAgent,
            messageType,
          })
        }
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
