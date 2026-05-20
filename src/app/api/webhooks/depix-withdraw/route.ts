import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/server/db";
import { logger } from "@/lib/logger";

/**
 * POST /api/webhooks/depix-withdraw
 *
 * Webhook Pixpay/Depix — recebe atualizacoes de saques (withdraw).
 * Paridade Laravel `DepixWebhookController::handle` quando webhookType=withdraw.
 *
 * Payload esperado (formato Pixpay):
 *   {
 *     id: "<depixId>",
 *     status: "unsent" | "processing" | "completed" | "failed" | "cancelled",
 *     blockchain_tx_id?: string,
 *     received_amount?: number,
 *     fee?: number
 *   }
 *
 * Seguranca:
 *   1) Header `X-Webhook-Signature: <hmac>` validado com PIXPAY_WEBHOOK_SECRET
 *   2) Sem secret = modo dev (warning + aceita)
 *   3) Idempotencia: se status atual ja for SENT/FAILED/CANCELLED nao reprocessa
 */
export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const secret = process.env.PIXPAY_WEBHOOK_SECRET;

    if (secret) {
      const signature = req.headers.get("x-webhook-signature") ?? "";
      const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
      const valid = signature.length === expected.length && signature.length > 0 &&
        timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
      if (!valid) {
        logger.warn("Depix-withdraw webhook: invalid signature");
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    } else {
      logger.warn("Depix-withdraw webhook: PIXPAY_WEBHOOK_SECRET ausente — aceitando sem verificação");
    }

    const payload = JSON.parse(rawBody) as {
      id?: string;
      status?: string;
      blockchain_tx_id?: string;
      received_amount?: number;
      fee?: number;
    };

    const depixId = payload.id;
    const statusRaw = (payload.status ?? "").toLowerCase();

    if (!depixId) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const mappedStatus = mapPixpayStatus(statusRaw);
    if (!mappedStatus) {
      return NextResponse.json({ ok: true, skipped: `unmapped status ${statusRaw}` });
    }

    logger.info("Depix-withdraw webhook", { depixId, statusRaw, mappedStatus });

    const result = await prisma.depixWithdraw.findFirst({
      where: { depixId },
      select: { id: true, status: true, tenantId: true },
    });

    if (!result) {
      logger.warn("Depix-withdraw webhook: record not found", { depixId });
      return NextResponse.json({ ok: true, matched: false });
    }

    // Idempotencia: estados terminais nao reprocessam
    if (["SENT", "FAILED", "CANCELLED"].includes(result.status) && mappedStatus !== result.status) {
      logger.info("Depix-withdraw webhook: state already terminal, skipping", {
        id: result.id,
        currentStatus: result.status,
        incomingStatus: mappedStatus,
      });
      return NextResponse.json({ ok: true, matched: true, skipped: true });
    }

    await prisma.depixWithdraw.update({
      where: { id: result.id },
      data: {
        status: mappedStatus,
        blockchainTxId: payload.blockchain_tx_id ?? undefined,
        receivedAmount: payload.received_amount ?? undefined,
        fee: payload.fee ?? undefined,
        apiResponse: payload as never,
      },
    });

    return NextResponse.json({ ok: true, matched: true, id: result.id });
  } catch (error) {
    logger.error("Depix-withdraw webhook error", { error: String(error) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

function mapPixpayStatus(status: string): "PROCESSING" | "SENT" | "FAILED" | "CANCELLED" | null {
  switch (status) {
    case "unsent":
    case "processing":
    case "pending":
      return "PROCESSING";
    case "completed":
    case "sent":
    case "paid":
      return "SENT";
    case "failed":
    case "error":
    case "rejected":
      return "FAILED";
    case "cancelled":
    case "canceled":
      return "CANCELLED";
    default:
      return null;
  }
}
