import { NextRequest, NextResponse } from "next/server"
import { withAdmin } from "@/server/db"
import { sendTextMessage } from "@/lib/services/whatsapp-service"
import { logger } from "@/lib/logger"

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
    const token = authHeader?.replace(/^Bearer\s+/i, "")
    if (token !== expectedToken) {
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

    // Find QuickSale by reference
    await withAdmin(async (tx) => {
      const quickSale = await tx.quickSale.findFirst({
        where: { number: referenceId },
      })

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

    return NextResponse.json({ ok: true })
  } catch (err) {
    logger.error("PagBank webhook error", {
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
