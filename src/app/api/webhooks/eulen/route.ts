import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { extractSourceIp } from "@/lib/webhooks/replay-guard";
import { verifyEulenWebhookAuth } from "@/lib/webhooks/eulen-auth";
import {
  handleEulenDepositWebhook,
  type EulenDepositPayload,
} from "@/lib/webhooks/eulen-deposit-handler";
import {
  handleEulenWithdrawWebhook,
  type EulenWithdrawPayload,
} from "@/lib/webhooks/eulen-withdraw-handler";

export const runtime = "nodejs";

/**
 * POST /api/webhooks/eulen
 *
 * Webhook oficial da Eulen (docs.eulen.app). Registrado no Bot:
 *   /registerwebhook deposit  https://pdvdepix.app/api/webhooks/eulen <secret>
 *   /registerwebhook withdraw https://pdvdepix.app/api/webhooks/eulen <secret>
 *
 * Auth: `Authorization: Basic base64(username:secret)` (EULEN_WEBHOOK_SECRET).
 * Responder 200 em ate 15s. Erros internos -> 200 (a Eulen reentrega via API;
 * o monitor LWK + cron de reconciliacao sao a rede de seguranca).
 */
export async function POST(req: NextRequest) {
  const auth = verifyEulenWebhookAuth(req.headers.get("authorization"));
  if (!auth.ok) {
    logger.warn("Eulen webhook: auth rejeitada", { reason: auth.reason });
    const code = auth.reason === "secret_not_configured" ? 503 : 401;
    return NextResponse.json({ error: "Unauthorized" }, { status: code });
  }

  let payload: { webhookType?: string } & Record<string, unknown>;
  try {
    payload = JSON.parse(await req.text());
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const sourceIp = extractSourceIp(req.headers);
  const type = String(payload.webhookType ?? "").toLowerCase();

  try {
    if (type === "withdraw") {
      const result = await handleEulenWithdrawWebhook(payload as EulenWithdrawPayload, sourceIp);
      return NextResponse.json(result.body, { status: result.status });
    }
    if (type === "deposit") {
      const result = await handleEulenDepositWebhook(payload as EulenDepositPayload, sourceIp);
      return NextResponse.json(result.body, { status: result.status });
    }
    logger.warn("Eulen webhook: webhookType desconhecido", { type });
    return NextResponse.json({ ok: true, ignored: `webhookType ${type}` });
  } catch (err) {
    logger.error("Eulen webhook: erro no handler", {
      type,
      err: err instanceof Error ? err.message : String(err),
    });
    // 200 pra Eulen nao reenviar infinito — fallback no monitor/cron.
    return NextResponse.json({ ok: true, error: "internal" });
  }
}
