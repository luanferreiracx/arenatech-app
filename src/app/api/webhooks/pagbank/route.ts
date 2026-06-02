import { NextRequest, NextResponse } from "next/server"
import { withAdmin } from "@/server/db"
import { sendTextMessage } from "@/lib/services/whatsapp-service"
import { logger } from "@/lib/logger"
import { timingSafeEqualString } from "@/lib/utils/timing-safe"
import {
  recordWebhookEvent,
  markWebhookProcessed,
  extractSourceIp,
} from "@/lib/webhooks/replay-guard"

/**
 * POST /api/webhooks/pagbank
 *
 * PagBank payment webhook — confirms payments for quick sales (VendaBot/QuickSale).
 * Faithful to Laravel PagBankWebhookController::handle().
 *
 * Flow:
 * 1. Verify token authentication
 * 2. Find QuickSale by reference_id
 * 3. Check charge status (PAID)
 * 4. Decrement stock for items
 * 5. Send WhatsApp notifications
 */
export async function POST(req: NextRequest) {
  try {
    // Verify authentication (obrigatorio - sem token configurado, recusa)
    const authHeader = req.headers.get("x-authentication-token") ?? req.headers.get("authorization")
    const expectedToken = process.env.PAGBANK_WEBHOOK_TOKEN
    if (!expectedToken) {
      logger.error("PagBank webhook: PAGBANK_WEBHOOK_TOKEN ausente. Configure a env var.")
      return NextResponse.json({ error: "Service not configured" }, { status: 503 })
    }
    const token = authHeader?.replace(/^Bearer\s+/i, "") ?? ""
    if (!timingSafeEqualString(token, expectedToken)) {
      logger.warn("PagBank webhook: invalid token")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json() as Record<string, unknown>
    logger.info("PagBank webhook received", { body: JSON.stringify(body).substring(0, 200) })

    // Extract charge info
    const charges = (body.charges ?? []) as Array<Record<string, unknown>>
    const charge = charges[0]
    if (!charge) {
      return NextResponse.json({ ok: true, message: "No charges" })
    }

    const chargeStatus = String(charge.status ?? "")
    const referenceId = String(body.reference_id ?? charge.reference_id ?? "")

    if (chargeStatus !== "PAID" || !referenceId) {
      logger.info("PagBank webhook: not paid or no reference", { chargeStatus, referenceId })
      return NextResponse.json({ ok: true })
    }

    // Replay protection: identifica evento unicamente por charge.id + status.
    const chargeId = String(charge.id ?? referenceId)
    const eventKey = `${chargeId}:${chargeStatus}`
    const isNewEvent = await recordWebhookEvent({
      provider: "pagbank",
      eventId: eventKey,
      eventType: chargeStatus,
      sourceIp: extractSourceIp(req.headers),
      signatureValid: true,
      payload: body,
    })
    if (!isNewEvent) {
      logger.info("PagBank webhook: evento duplicado", { eventKey })
      return NextResponse.json({ ok: true, duplicate: true })
    }

    // Find QuickSale by reference.
    // SEGURANCA (isolamento cross-tenant): `number` so e unico POR tenant
    // (@@unique([tenantId, number])). O payload do PagBank nao traz o tenant,
    // entao um match por `number` pode colidir entre tenants e marcar a venda
    // ERRADA como paga. Recusamos se houver ambiguidade (>1 match). Ideal:
    // embutir o tenant no reference_id da cobranca quando o PagBank for ativado
    // (hoje nenhum fluxo cria cobranca PagBank — gateway ativo e DePix).
    await withAdmin(async (tx) => {
      const matches = await tx.quickSale.findMany({
        where: { number: referenceId },
        take: 2,
      })

      if (matches.length > 1) {
        logger.error("PagBank webhook: referenceId ambiguo entre tenants — recusado", {
          referenceId,
          matchCount: matches.length,
        })
        return
      }

      const quickSale = matches[0]

      if (!quickSale) {
        logger.warn("PagBank webhook: QuickSale not found", { referenceId })
        return
      }

      if (quickSale.status === "PAID") {
        logger.info("PagBank webhook: already paid", { referenceId })
        return
      }

      // Mark as paid
      await tx.quickSale.update({
        where: { id: quickSale.id },
        data: {
          status: "PAID",
          paidAt: new Date(),
        },
      })

      logger.info("PagBank webhook: QuickSale marked as paid", {
        quickSaleId: quickSale.id,
        amount: String(quickSale.totalAmount),
      })

      // Send WhatsApp notification to store
      const tenantSettings = await tx.tenantSettings.findFirst({
        where: { tenantId: quickSale.tenantId },
        select: { phone: true, tradeName: true },
      })

      if (tenantSettings?.phone) {
        await sendTextMessage(
          tenantSettings.phone,
          `Pagamento confirmado! Venda rapida ${quickSale.number} - R$ ${Number(quickSale.totalAmount).toFixed(2)}`,
        )
      }
    })

    await markWebhookProcessed("pagbank", eventKey, { ok: true })
    return NextResponse.json({ ok: true })
  } catch (err) {
    logger.error("PagBank webhook error", {
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
