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
    //
    // ⚠️ SEGURANÇA: quando o token vem via query string, ele aparece na URL e
    // por padrão é gravado em texto puro nas access logs do nginx. Quem ler as
    // logs consegue forjar webhooks. Mitigação operacional: o server block do
    // nginx para este endpoint redige o parâmetro `token` antes de logar
    // (ver docs/decisions/0048-chatwoot-webhook-token-redaction.md). Prefira
    // sempre o header `authorization: Bearer <token>` quando o caminho permitir.
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
        const rawMediaType = firstAttachment
          ? String(firstAttachment.file_type ?? firstAttachment.type ?? "file")
          : null
        const normalizedMediaType = rawMediaType?.toLowerCase() ?? null

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
        // Sender.type Chatwoot: "contact"=cliente, "user"=atendente, "agent_bot"=bot.

        // REGRA DO BOT (decisão do dono): seguimos o STATUS da conversa no
        // Chatwoot, não uma máquina de estados própria. "open" = atendente no
        // caso (bot cala); "pending"/"resolved" = bot responde. Quem põe em
        // "open": atendente assume OU o bot encaminha pra um time (auto-assign).
        const chatwootStatus = String(conversation?.status ?? "").toLowerCase()
        const botShouldReply = chatwootStatus === "pending" || chatwootStatus === "resolved"

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

          // Status mapeado do Chatwoot (fonte da verdade).
          // open→OPEN (atendente), pending→BOT_ACTIVE, resolved→RESOLVED.
          const mappedStatus =
            chatwootStatus === "open"
              ? "OPEN"
              : chatwootStatus === "resolved"
                ? "RESOLVED"
                : "BOT_ACTIVE" // pending (ou ausente) → bot atende

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
                status: mappedStatus,
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
          // descreve no runner). Chatwoot pode enviar file_type como "image"
          // ou como MIME (ex.: "image/jpeg"); ambos devem acionar visão.
          const isImage = !!mediaUrl && !!normalizedMediaType && (
            normalizedMediaType === "image" || normalizedMediaType.startsWith("image/")
          )
          const contentType = isImage
            ? "image"
            : rawMediaType
              ? rawMediaType
              : String(body.content_type ?? "text")
          const persistedContent = message?.trim()
            ? message
            : rawMediaType
              ? `[mídia: ${rawMediaType}]`
              : ""

          // ECO DO BOT: quando o Talison posta a resposta via API, o Chatwoot
          // reentrega essa outgoing no webhook como sender=user. Nós JÁ salvamos
          // essa resposta (como senderType=bot) no runner — então o eco é
          // redundante. Sem isto, ele virava uma 2ª mensagem "[atendente]"
          // idêntica no histórico, e o modelo repetia o texto na resposta
          // seguinte. Dedup por conteúdo idêntico a uma msg bot recente.
          if (!isIncoming && persistedContent) {
            const recentBotEcho = await tx.chatbotMessage.findFirst({
              where: {
                tenantId,
                conversationId: conv.id,
                senderType: "bot",
                content: persistedContent,
                createdAt: { gt: new Date(Date.now() - 5 * 60 * 1000) },
              },
              select: { id: true },
            })
            if (recentBotEcho) {
              logger.info("Chatwoot webhook: eco da resposta do bot ignorado", { conversationId: conv.id })
              return { conversationId: conv.id, triggerBot: false }
            }
          }

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

          // Espelha o status do Chatwoot no nosso registro (fonte da verdade
          // é o Chatwoot).
          await tx.chatbotConversation.update({
            where: { id: conv.id },
            data: {
              status: mappedStatus,
              resolvedAt: mappedStatus === "RESOLVED" ? new Date() : null,
              lastMessageAt: new Date(),
              contactName: contactName || conv.contactName,
              externalId: externalConvId || conv.externalId,
            },
          })

          // Aciona o Talison em mensagem do cliente quando o Chatwoot diz que o
          // bot deve responder (pending/resolved). O scheduler faz o debounce.
          const triggerBot = isIncoming && botShouldReply
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
            chatwootStatus,
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
