import { NextRequest, NextResponse } from "next/server";
import { withAdmin } from "@/server/db";
import { logger } from "@/lib/logger";

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
  if (expectedToken) {
    const header = req.headers.get("authorization");
    if (header !== `Bearer ${expectedToken}`) {
      logger.warn("Evolution webhook: invalid auth");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const body = (await req.json()) as {
      event?: string;
      data?: {
        key?: { id?: string; remoteJid?: string };
        update?: { status?: string };
        message?: unknown;
      };
    };

    const event = String(body.event ?? "");
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
