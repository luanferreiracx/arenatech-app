import { NextRequest, NextResponse } from "next/server";
import { withAdmin } from "@/server/db";
import { logger } from "@/lib/logger";
import { parseIPhoneListing } from "@/lib/services/iphone-listing-parser";
import { timingSafeEqualString } from "@/lib/utils/timing-safe";

/**
 * POST /api/webhooks/evolution
 *
 * Webhook Evolution API (WhatsApp) — recebe status updates de mensagens enviadas.
 *
 * Eventos esperados:
 *   - "messages.upsert" — mensagem enviada
 *   - "messages.update" — status atualizado (DELIVERED, READ, FAILED)
 *
 * Payload tipico:
 *   {
 *     event: "messages.update",
 *     data: {
 *       key: { id: "<providerMessageId>", remoteJid: "5511999..." },
 *       update: { status: "DELIVERY_ACK" | "READ" | "ERROR" }
 *     }
 *   }
 *
 * Seguranca: valida `Authorization: Bearer EVOLUTION_WEBHOOK_TOKEN` se a env
 * estiver configurada. Modo dev aceita sem token (log warning).
 */
export async function POST(req: NextRequest) {
  const expectedToken = process.env.EVOLUTION_WEBHOOK_TOKEN;
  if (!expectedToken) {
    if (process.env.NODE_ENV === "production") {
      logger.error("Evolution webhook: EVOLUTION_WEBHOOK_TOKEN ausente em prod — rejeitando.");
      return NextResponse.json({ error: "Service not configured" }, { status: 503 });
    }
    logger.warn("Evolution webhook: sem EVOLUTION_WEBHOOK_TOKEN — aceitando em dev");
  } else {
    const header = req.headers.get("authorization") ?? "";
    if (!timingSafeEqualString(header, `Bearer ${expectedToken}`)) {
      logger.warn("Evolution webhook: invalid auth");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const body = (await req.json()) as EvolutionWebhookPayload;

    const event = String(body.event ?? "");

    // messages.upsert em grupo monitorado: persistir + extrair iPhone
    if (event === "messages.upsert" || event === "MESSAGES_UPSERT") {
      return await handleGroupMessageUpsert(body);
    }

    const providerMessageId = body.data?.key?.id;
    const status = body.data?.update?.status?.toUpperCase() ?? "";

    if (!providerMessageId) {
      return NextResponse.json({ ok: true, skipped: "no message id" });
    }

    const mappedStatus = mapEvolutionStatus(status);
    if (!mappedStatus) {
      return NextResponse.json({ ok: true, skipped: `unmapped status ${status}` });
    }

    logger.info("Evolution webhook", { event, providerMessageId, status, mappedStatus });

    const result = await withAdmin(async (tx) => {
      const message = await tx.message.findFirst({
        where: { providerMessageId },
        select: { id: true, status: true, tenantId: true },
      });
      if (!message) {
        return { matched: false };
      }

      // Nao retrocede status (READ > DELIVERED > SENT)
      const statusRank: Record<string, number> = {
        PENDING: 0,
        SENT: 1,
        DELIVERED: 2,
        READ: 3,
        FAILED: 99, // FAILED pode sobrescrever qualquer um
      };
      const currentRank = statusRank[message.status] ?? 0;
      const newRank = statusRank[mappedStatus] ?? 0;
      if (mappedStatus !== "FAILED" && newRank < currentRank) {
        return { matched: true, skipped: true, currentStatus: message.status };
      }

      const updateData: {
        status: typeof mappedStatus;
        deliveredAt?: Date;
        readAt?: Date;
      } = { status: mappedStatus };
      if (mappedStatus === "DELIVERED") updateData.deliveredAt = new Date();
      if (mappedStatus === "READ") {
        updateData.readAt = new Date();
        // Read tambem implica delivered se ainda nao tiver
        updateData.deliveredAt = new Date();
      }

      await tx.message.update({
        where: { id: message.id },
        data: updateData,
      });

      return { matched: true, messageId: message.id };
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    logger.error("Evolution webhook error", { error: String(error) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

interface EvolutionWebhookPayload {
  event?: string;
  data?: {
    key?: { id?: string; remoteJid?: string; fromMe?: boolean; participant?: string };
    update?: { status?: string };
    message?: {
      conversation?: string;
      extendedTextMessage?: { text?: string };
      imageMessage?: { caption?: string; url?: string };
      videoMessage?: { caption?: string };
    };
    messageTimestamp?: number | string;
    pushName?: string;
  };
}

/**
 * messages.upsert: nova mensagem recebida.
 * - Filtra apenas grupos (`remoteJid` termina em `@g.us`).
 * - Resolve tenant via `WhatsAppGroup.evolutionGroupJid` (com `monitored=true`).
 * - Persiste a mensagem (idempotente por `evolution_message_id`).
 * - Roda parser de iPhone; se match, cria `IPhoneListing`.
 */
async function handleGroupMessageUpsert(body: EvolutionWebhookPayload) {
  const remoteJid = body.data?.key?.remoteJid;
  const evolutionMessageId = body.data?.key?.id;
  if (!remoteJid || !evolutionMessageId || !remoteJid.endsWith("@g.us")) {
    return NextResponse.json({ ok: true, skipped: "not a group message" });
  }

  const message = body.data?.message;
  const bodyText =
    message?.conversation ??
    message?.extendedTextMessage?.text ??
    message?.imageMessage?.caption ??
    message?.videoMessage?.caption ??
    "";
  if (!bodyText.trim()) {
    return NextResponse.json({ ok: true, skipped: "empty body" });
  }

  const senderJid = body.data?.key?.participant ?? remoteJid;
  const senderName = body.data?.pushName ?? null;
  const timestamp = body.data?.messageTimestamp;
  const postedAt =
    typeof timestamp === "number"
      ? new Date(timestamp * 1000)
      : typeof timestamp === "string"
        ? new Date(Number(timestamp) * 1000)
        : new Date();

  const result = await withAdmin(async (tx) => {
    const group = await tx.whatsAppGroup.findFirst({
      where: { evolutionGroupJid: remoteJid, monitored: true },
      select: { id: true, tenantId: true },
    });
    if (!group) return { matched: false, reason: "group not monitored" };

    const existing = await tx.whatsAppGroupMessage.findFirst({
      where: { tenantId: group.tenantId, evolutionMessageId },
      select: { id: true },
    });
    if (existing) return { matched: true, duplicate: true };

    const created = await tx.whatsAppGroupMessage.create({
      data: {
        tenantId: group.tenantId,
        groupId: group.id,
        evolutionMessageId,
        senderJid,
        senderName,
        bodyText,
        mediaUrl: message?.imageMessage?.url ?? null,
        mediaType: message?.imageMessage ? "image" : message?.videoMessage ? "video" : null,
        postedAt,
      },
      select: { id: true },
    });

    const parsed = parseIPhoneListing(bodyText);
    if (parsed) {
      await tx.iPhoneListing.create({
        data: {
          tenantId: group.tenantId,
          messageId: created.id,
          model: parsed.model,
          storageGb: parsed.storageGb,
          color: parsed.color,
          priceCents: parsed.priceCents,
          hasBox: parsed.hasBox,
          condition: parsed.condition,
          rawSnippet: parsed.rawSnippet,
          postedAt,
        },
      });
    }

    return { matched: true, messageId: created.id, listing: parsed !== null };
  });

  return NextResponse.json({ ok: true, ...result });
}

function mapEvolutionStatus(status: string): "SENT" | "DELIVERED" | "READ" | "FAILED" | null {
  switch (status) {
    case "PENDING":
    case "SERVER_ACK":
      return "SENT";
    case "DELIVERY_ACK":
    case "DELIVERED":
      return "DELIVERED";
    case "READ":
    case "PLAYED":
      return "READ";
    case "ERROR":
    case "FAILED":
      return "FAILED";
    default:
      return null;
  }
}
