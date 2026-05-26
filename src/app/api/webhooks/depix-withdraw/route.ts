import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { logger } from "@/lib/logger";
import { extractSourceIp } from "@/lib/webhooks/replay-guard";
import {
  handleDepixWithdrawWebhook,
  type PixpayWithdrawPayload,
} from "@/lib/webhooks/depix-withdraw-handler";

/**
 * POST /api/webhooks/depix-withdraw
 *
 * Endpoint LEGADO. Pixpay deve ser configurado para enviar tudo em
 * `/api/webhooks/depix-payment` (unificado) — esse aqui fica como fallback
 * caso a URL antiga ainda esteja em alguma config externa.
 *
 * Paridade Laravel `DepixWebhookController::handle` quando webhookType=withdraw.
 */
export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const secret = process.env.PIXPAY_WEBHOOK_SECRET;

    if (!secret) {
      logger.error("Depix-withdraw webhook: PIXPAY_WEBHOOK_SECRET ausente");
      return NextResponse.json({ error: "Service not configured" }, { status: 503 });
    }
    const signature = req.headers.get("x-webhook-signature") ?? "";
    const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
    const valid = signature.length === expected.length && signature.length > 0 &&
      timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    if (!valid) {
      logger.warn("Depix-withdraw webhook: invalid signature");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = JSON.parse(rawBody) as PixpayWithdrawPayload;
    const sourceIp = extractSourceIp(req.headers);
    const result = await handleDepixWithdrawWebhook(payload, sourceIp, true);
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    logger.error("Depix-withdraw webhook error", { error: String(error) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
