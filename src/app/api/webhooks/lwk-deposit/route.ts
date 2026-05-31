import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { logger } from "@/lib/logger";
import { extractSourceIp } from "@/lib/webhooks/replay-guard";
import {
  handleLwkDepositWebhook,
  type LwkDepositPayload,
} from "@/lib/webhooks/lwk-deposit-handler";

export const runtime = "nodejs";

/**
 * POST /api/webhooks/lwk-deposit
 *
 * Webhook do monitor LWK — dispara quando deposito DePix eh detectado/confirmado
 * em alguma carteira gerenciada pelo servico.
 *
 * Auth: header `X-Signature: sha256=<hex>` = HMAC-SHA256(body, LWK_WEBHOOK_SECRET).
 *       Fail-closed em prod (sem secret = 503).
 *
 * Idempotencia: por (txid, tenant_id, status) no DepixWebhookEvent — replay
 * retorna 200 sem efeito.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.LWK_WEBHOOK_SECRET;
  const rawBody = await req.text();

  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      logger.error("LWK webhook: LWK_WEBHOOK_SECRET ausente em prod");
      return NextResponse.json({ error: "service not configured" }, { status: 503 });
    }
    logger.warn("LWK webhook: LWK_WEBHOOK_SECRET ausente — processando sem auth (dev)");
  }

  let signatureValid = false;
  if (secret) {
    const sigHeader = req.headers.get("x-signature") ?? "";
    // Formato: "sha256=<hex>"
    const expected = "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");
    try {
      signatureValid =
        sigHeader.length === expected.length &&
        sigHeader.length > 0 &&
        timingSafeEqual(Buffer.from(sigHeader), Buffer.from(expected));
    } catch {
      signatureValid = false;
    }
    if (!signatureValid) {
      logger.warn("LWK webhook: HMAC invalido");
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  let payload: LwkDepositPayload;
  try {
    payload = JSON.parse(rawBody) as LwkDepositPayload;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  try {
    const sourceIp = extractSourceIp(req.headers);
    const result = await handleLwkDepositWebhook(payload, sourceIp, signatureValid);
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    logger.error("LWK webhook: erro no handler", {
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
