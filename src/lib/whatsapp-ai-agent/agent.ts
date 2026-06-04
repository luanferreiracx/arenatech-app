import { withAdmin } from "@/server/db";
import { logger } from "@/lib/logger";
import { sendTextMessage } from "@/lib/services/whatsapp-service";
import type { WhatsappAiInboundMessage } from "@/lib/whatsapp-ai-agent/evolution-payload";
import { generateWhatsappAiReply, type WhatsappAiHistoryMessage } from "@/lib/whatsapp-ai-agent/claude-provider";

const HISTORY_LIMIT = 20;

export type WhatsappAiProcessResult = {
  status: "replied" | "skipped";
  reason?: string;
  providerMessageId?: string;
};

type StoredAiMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

function toClaudeHistory(messages: StoredAiMessage[]): WhatsappAiHistoryMessage[] {
  const history: WhatsappAiHistoryMessage[] = [];
  for (const message of messages) {
    if (message.role === "user" || message.role === "assistant") {
      history.push({ role: message.role, content: message.content });
    }
  }
  return history;
}

export async function processWhatsappAiMessage(params: {
  tenantId: string;
  phone: string;
  message: WhatsappAiInboundMessage;
}): Promise<WhatsappAiProcessResult> {
  const instanceName = params.message.instanceName;
  if (!instanceName) return { status: "skipped", reason: "missing instance" };

  const state = await withAdmin(async (tx) => {
    const conversation = await tx.whatsappAiConversation.upsert({
      where: {
        tenantId_instanceName_phone: {
          tenantId: params.tenantId,
          instanceName,
          phone: params.phone,
        },
      },
      update: {
        remoteJid: params.message.remoteJid,
        lastMessageAt: params.message.timestamp,
      },
      create: {
        tenantId: params.tenantId,
        phone: params.phone,
        remoteJid: params.message.remoteJid,
        instanceName,
        lastMessageAt: params.message.timestamp,
      },
      select: { id: true },
    });

    const existing = await tx.whatsappAiMessage.findFirst({
      where: {
        tenantId: params.tenantId,
        evolutionMessageId: params.message.messageId,
      },
      select: { id: true },
    });
    if (existing) return { conversationId: conversation.id, duplicate: true, history: [] };

    await tx.whatsappAiMessage.create({
      data: {
        tenantId: params.tenantId,
        conversationId: conversation.id,
        role: "user",
        content: params.message.text,
        evolutionMessageId: params.message.messageId,
        metadata: {
          remoteJid: params.message.remoteJid,
          pushName: params.message.pushName,
          event: params.message.event,
        },
      },
    });

    const history = await tx.whatsappAiMessage.findMany({
      where: { tenantId: params.tenantId, conversationId: conversation.id },
      orderBy: { createdAt: "desc" },
      take: HISTORY_LIMIT,
      select: { role: true, content: true },
    });

    return { conversationId: conversation.id, duplicate: false, history: history.reverse() };
  });

  if (state.duplicate) return { status: "skipped", reason: "duplicate message" };

  const historyWithoutCurrent = toClaudeHistory(state.history).slice(0, -1);
  const reply = await generateWhatsappAiReply({
    history: historyWithoutCurrent,
    userMessage: params.message.text,
  });

  const sendResult = await sendTextMessage(params.phone, reply, { instanceName });
  if (!sendResult.success) {
    logger.error("WhatsApp IA: falha ao enviar resposta", {
      phone: params.phone,
      instanceName,
      error: sendResult.error,
    });
    throw new Error(sendResult.error ?? "Falha ao enviar resposta via Evolution");
  }

  await withAdmin(async (tx) => {
    await tx.whatsappAiMessage.create({
      data: {
        tenantId: params.tenantId,
        conversationId: state.conversationId,
        role: "assistant",
        content: reply,
        providerMessageId: sendResult.messageId ?? null,
      },
    });
    await tx.whatsappAiConversation.update({
      where: { id: state.conversationId },
      data: { lastMessageAt: new Date() },
    });
  });

  logger.info("WhatsApp IA: mensagem respondida", {
    conversationId: state.conversationId,
    phone: params.phone,
    instanceName,
    providerMessageId: sendResult.messageId,
  });

  return { status: "replied", providerMessageId: sendResult.messageId };
}
