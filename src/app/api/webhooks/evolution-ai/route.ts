import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { timingSafeEqualString } from "@/lib/utils/timing-safe";
import { extractSourceIp, markWebhookProcessed, recordWebhookEvent } from "@/lib/webhooks/replay-guard";
import { getWhatsappAiAccessConfig, validateWhatsappAiInboundAccess } from "@/lib/whatsapp-ai-agent/access-control";
import { parseEvolutionAiInbound, type EvolutionWebhookPayload } from "@/lib/whatsapp-ai-agent/evolution-payload";
import { processWhatsappAiMessage } from "@/lib/whatsapp-ai-agent/agent";

export async function POST(req: NextRequest) {
  const config = getWhatsappAiAccessConfig();
  if (!config.webhookToken) {
    if (process.env.NODE_ENV === "production") {
      logger.error("WhatsApp IA webhook: WHATSAPP_AI_WEBHOOK_TOKEN ausente em prod");
      return NextResponse.json({ error: "Service not configured" }, { status: 503 });
    }
    logger.warn("WhatsApp IA webhook: sem WHATSAPP_AI_WEBHOOK_TOKEN — aceitando em dev");
  } else {
    const header = req.headers.get("authorization") ?? "";
    if (!timingSafeEqualString(header, `Bearer ${config.webhookToken}`)) {
      logger.warn("WhatsApp IA webhook: invalid auth");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const inbound = parseEvolutionAiInbound(body as EvolutionWebhookPayload);
  if (!inbound) return NextResponse.json({ ok: true, skipped: "not an inbound message" });

  const access = validateWhatsappAiInboundAccess({
    config,
    instanceName: inbound.instanceName,
    remoteJid: inbound.remoteJid,
    fromMe: inbound.fromMe,
    isGroup: inbound.isGroup,
    hasContent: inbound.text.length > 0 || inbound.attachments.length > 0,
  });
  if (!access.allowed) {
    logger.info("WhatsApp IA webhook: evento ignorado", {
      reason: access.reason,
      instanceName: inbound.instanceName,
      remoteJid: inbound.remoteJid,
      messageId: inbound.messageId,
    });
    return NextResponse.json({ ok: true, skipped: access.reason });
  }

  const eventId = `${inbound.instanceName ?? "unknown"}:${inbound.messageId}`;
  const isNew = await recordWebhookEvent({
    provider: "evolution_ai",
    eventId,
    eventType: inbound.event,
    sourceIp: extractSourceIp(req.headers),
    signatureValid: Boolean(config.webhookToken),
    payload: body,
  });
  if (!isNew) return NextResponse.json({ ok: true, skipped: "duplicate" });

  try {
    const result = await processWhatsappAiMessage({
      tenantId: config.tenantId!,
      phone: access.phone,
      agentKind: access.agentKind,
      message: inbound,
    });
    await markWebhookProcessed("evolution_ai", eventId, { ok: true });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("WhatsApp IA webhook error", { eventId, error: message });
    await markWebhookProcessed("evolution_ai", eventId, { ok: false, errorMessage: message });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
