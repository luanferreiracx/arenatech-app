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
import {
  handleEulenMedWebhook,
  type EulenMedPayload,
} from "@/lib/webhooks/eulen-med-handler";

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

  const rawBody = await req.text();
  let payload: { webhookType?: string } & Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    // Loga o corpo cru (ajuda a entender webhooks fora do contrato, ex.: QR
    // estatico). 200 pra nao gerar alerta de erro no Bot da Eulen.
    logger.warn("Eulen webhook: corpo nao-JSON", { rawBody: rawBody.slice(0, 1000) });
    return NextResponse.json({ ok: true, ignored: "invalid_json" });
  }

  const sourceIp = extractSourceIp(req.headers);
  const type = String(payload.webhookType ?? "").toLowerCase();

  try {
    if (type === "withdraw") {
      const result = await handleEulenWithdrawWebhook(payload as EulenWithdrawPayload, sourceIp);
      return ackOnClientError(result, type, rawBody);
    }
    if (type === "deposit") {
      const result = await handleEulenDepositWebhook(payload as EulenDepositPayload, sourceIp);
      return ackOnClientError(result, type, rawBody);
    }
    if (type === "med") {
      const result = await handleEulenMedWebhook(payload as EulenMedPayload, sourceIp);
      return ackOnClientError(result, type, rawBody);
    }
    // webhookType desconhecido (inclui o QR estatico, que pode nao mandar
    // webhookType): loga o corpo cru e ACK 200 (nao alarmar o Bot da Eulen).
    logger.warn("Eulen webhook: webhookType desconhecido — corpo cru", {
      type: type || "(vazio)",
      rawBody: rawBody.slice(0, 1000),
    });
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

/**
 * Responde 200 mesmo quando o handler retorna 4xx de "cliente" (ex.: missing
 * qrId/id) — caso provavel do QR estatico, que nao tem deposit-id nosso. Loga o
 * corpo cru pra diagnosticar o formato. Um 400 fazia o Bot da Eulen alarmar
 * ("non-200 status code: 400"); o monitor LWK + cron cobrem a conciliacao.
 */
function ackOnClientError(
  result: { status: number; body: Record<string, unknown> },
  type: string,
  rawBody: string,
): NextResponse {
  if (result.status >= 400 && result.status < 500) {
    logger.warn("Eulen webhook: handler retornou 4xx — ACK 200 + corpo cru", {
      type,
      handlerStatus: result.status,
      handlerBody: result.body,
      rawBody: rawBody.slice(0, 1000),
    });
    return NextResponse.json({ ok: true, acked: true, original: result.body });
  }
  return NextResponse.json(result.body, { status: result.status });
}
