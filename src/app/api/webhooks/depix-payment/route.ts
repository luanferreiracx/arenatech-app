import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { withAdmin } from "@/server/db";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

/**
 * POST /api/webhooks/depix-payment
 *
 * Webhook Pixpay/Depix — recebe confirmacoes de pagamento de PIX (deposits).
 * Quando o pagamento eh confirmado (`status=completed`), a venda associada
 * ao `transactionId` (ou OS) eh marcada como paga automaticamente.
 *
 * Paridade Laravel: lado servidor do consultarStatusPix, agora event-driven.
 *
 * Payload esperado (Pixpay):
 *   {
 *     id: "<transactionId>",
 *     status: "pending" | "confirmed" | "completed" | "cancelled" | "expired",
 *     paid_amount?: number,
 *     paid_at?: string
 *   }
 *
 * Seguranca:
 *   - X-Webhook-Signature = HMAC-SHA256(body, PIXPAY_WEBHOOK_SECRET)
 *   - Sem secret = 503
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const secret = process.env.PIXPAY_WEBHOOK_SECRET;
  if (!secret) {
    logger.error("Depix-payment webhook: PIXPAY_WEBHOOK_SECRET ausente");
    return NextResponse.json({ error: "Service not configured" }, { status: 503 });
  }
  const signature = req.headers.get("x-webhook-signature") ?? "";
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const valid =
    signature.length === expected.length &&
    signature.length > 0 &&
    timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  if (!valid) {
    logger.warn("Depix-payment webhook: invalid signature");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: { id?: string; status?: string; paid_amount?: number; paid_at?: string };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const transactionId = String(payload.id ?? "");
  const status = String(payload.status ?? "").toLowerCase();
  const paidAt = payload.paid_at ? new Date(payload.paid_at) : new Date();

  logger.info("Depix-payment webhook recebido", { transactionId, status });

  // So agimos em pagamento confirmado.
  if (!["completed", "confirmed", "paid"].includes(status)) {
    return NextResponse.json({ received: true, ignored: true });
  }
  if (!transactionId) {
    return NextResponse.json({ received: true });
  }

  // Localiza venda OU OS pelo depixTransactionId.
  const result = await withAdmin(async (tx) => {
    const sale = await tx.sale.findFirst({
      where: { paymentDetails: { path: ["depixTransactionId"], equals: transactionId } as never },
      select: { id: true, tenantId: true, status: true, number: true, totalAmount: true },
    });
    if (sale && sale.status !== "COMPLETED") {
      // Sale existe e ainda nao foi marcada como paga. Atualizamos status,
      // paidAmount e gravamos audit.
      await tx.sale.update({
        where: { id: sale.id },
        data: {
          status: "COMPLETED",
          paidAmount: sale.totalAmount,
          saleDate: paidAt,
        },
      });
      return { kind: "sale", id: sale.id, number: sale.number };
    }

    const order = await tx.serviceOrder.findFirst({
      where: { depixTransactionId: transactionId },
      select: {
        id: true,
        tenantId: true,
        status: true,
        number: true,
        totalAmount: true,
        createdById: true,
      },
    });
    if (order && order.status !== "PAID") {
      await tx.serviceOrder.update({
        where: { id: order.id },
        data: {
          status: "PAID",
          paidAmount: order.totalAmount,
          paymentMethod: "pix_depix",
          paymentDate: paidAt,
          depixStatus: "confirmed",
        },
      });
      await tx.serviceOrderHistory.create({
        data: {
          tenantId: order.tenantId,
          orderId: order.id,
          userId: order.createdById,
          previousStatus: order.status,
          newStatus: "PAID",
          notes: `Pagamento Pix Depix confirmado (transaction ${transactionId})`,
        },
      });
      return { kind: "order", id: order.id, number: order.number };
    }

    return null;
  });

  if (!result) {
    logger.warn("Depix-payment webhook sem alvo encontrado", { transactionId });
    return NextResponse.json({ received: true, found: false });
  }

  logger.info("Depix-payment webhook processado", {
    kind: result.kind,
    id: result.id,
    number: result.number,
  });
  return NextResponse.json({ received: true, kind: result.kind });
}
