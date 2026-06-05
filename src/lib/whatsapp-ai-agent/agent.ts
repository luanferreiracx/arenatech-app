import { withAdmin } from "@/server/db";
import { logger } from "@/lib/logger";
import { sendTextMessage } from "@/lib/services/whatsapp-service";
import type { WhatsappAiAgentKind } from "@/lib/whatsapp-ai-agent/access-control";
import type { WhatsappAiInboundMessage } from "@/lib/whatsapp-ai-agent/evolution-payload";
import { generateWhatsappAiReply, type WhatsappAiHistoryMessage } from "@/lib/whatsapp-ai-agent/claude-provider";
import { validateWhatsappAiImages } from "@/lib/whatsapp-ai-agent/media";
import { parseWhatsappAiCommand } from "@/lib/whatsapp-ai-agent/command-parser";
import { dispatchClaudeCodeExecution } from "@/lib/whatsapp-ai-agent/code-agent";

const HISTORY_LIMIT = 20;
const DEFAULT_ASSISTANT_MODEL = "claude-opus-4-8";
const DEFAULT_CODE_MODEL = "claude-opus-4-8";

export type WhatsappAiProcessResult = {
  status: "replied" | "skipped" | "queued";
  reason?: string;
  providerMessageId?: string;
  executionId?: string;
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

function defaultModelFor(kind: WhatsappAiAgentKind): string {
  if (kind === "claude_code") {
    return process.env.WHATSAPP_AI_CODE_MODEL?.trim() || process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_CODE_MODEL;
  }
  return process.env.WHATSAPP_AI_ASSISTANT_MODEL?.trim() || process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_ASSISTANT_MODEL;
}

function codeAutoRunEnabled(): boolean {
  return process.env.WHATSAPP_AI_CODE_AUTO_RUN !== "false";
}

async function sendAndPersist(params: {
  tenantId: string;
  conversationId: string;
  phone: string;
  instanceName: string;
  content: string;
  metadata?: Record<string, unknown>;
}): Promise<string | undefined> {
  const sendResult = await sendTextMessage(params.phone, params.content, { instanceName: params.instanceName });
  if (!sendResult.success) {
    throw new Error(sendResult.error ?? "Falha ao enviar resposta via Evolution");
  }

  await withAdmin(async (tx) => {
    await tx.whatsappAiMessage.create({
      data: {
        tenantId: params.tenantId,
        conversationId: params.conversationId,
        role: "assistant",
        content: params.content,
        providerMessageId: sendResult.messageId ?? null,
        metadata: params.metadata ? (params.metadata as never) : undefined,
      },
    });
    await tx.whatsappAiConversation.update({
      where: { id: params.conversationId },
      data: { lastMessageAt: new Date() },
    });
  });

  return sendResult.messageId;
}

export async function processWhatsappAiMessage(params: {
  tenantId: string;
  phone: string;
  agentKind?: WhatsappAiAgentKind;
  message: WhatsappAiInboundMessage;
}): Promise<WhatsappAiProcessResult> {
  const instanceName = params.message.instanceName;
  if (!instanceName) return { status: "skipped", reason: "missing instance" };
  const agentKind = params.agentKind ?? "assistant";

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
        agentKind,
        lastMessageAt: params.message.timestamp,
      },
      create: {
        tenantId: params.tenantId,
        phone: params.phone,
        remoteJid: params.message.remoteJid,
        instanceName,
        agentKind,
        model: defaultModelFor(agentKind),
        lastMessageAt: params.message.timestamp,
      },
      select: { id: true, paused: true, model: true, agentKind: true },
    });

    const existing = await tx.whatsappAiMessage.findFirst({
      where: {
        tenantId: params.tenantId,
        evolutionMessageId: params.message.messageId,
      },
      select: { id: true },
    });
    if (existing) return { conversation, duplicate: true, history: [] };

    await tx.whatsappAiMessage.create({
      data: {
        tenantId: params.tenantId,
        conversationId: conversation.id,
        role: "user",
        content: params.message.text,
        evolutionMessageId: params.message.messageId,
        metadata: {
          agentKind,
          remoteJid: params.message.remoteJid,
          pushName: params.message.pushName,
          event: params.message.event,
          attachments: params.message.attachments.map((attachment) => ({
            kind: attachment.kind,
            mimeType: attachment.mimeType,
            hasUrl: Boolean(attachment.url),
            fileLength: attachment.fileLength,
          })),
        },
      },
    });

    const history = await tx.whatsappAiMessage.findMany({
      where: { tenantId: params.tenantId, conversationId: conversation.id },
      orderBy: { createdAt: "desc" },
      take: HISTORY_LIMIT,
      select: { role: true, content: true },
    });

    return { conversation, duplicate: false, history: history.reverse() };
  });

  if (state.duplicate) return { status: "skipped", reason: "duplicate message" };

  const command = parseWhatsappAiCommand(params.message.text);

  if (command.type === "resume") {
    await withAdmin(async (tx) => tx.whatsappAiConversation.update({
      where: { id: state.conversation.id },
      data: { paused: false },
    }));
    const providerMessageId = await sendAndPersist({
      tenantId: params.tenantId,
      conversationId: state.conversation.id,
      phone: params.phone,
      instanceName,
      content: "Agente retomado.",
      metadata: { agentKind, command: "resume" },
    });
    return { status: "replied", providerMessageId };
  }

  if (state.conversation.paused) {
    return { status: "skipped", reason: "paused" };
  }

  if (command.type === "pause") {
    await withAdmin(async (tx) => tx.whatsappAiConversation.update({
      where: { id: state.conversation.id },
      data: { paused: true },
    }));
    const providerMessageId = await sendAndPersist({
      tenantId: params.tenantId,
      conversationId: state.conversation.id,
      phone: params.phone,
      instanceName,
      content: "Agente pausado. Envie /resume para retomar.",
      metadata: { agentKind, command: "pause" },
    });
    return { status: "replied", providerMessageId };
  }

  if (command.type === "model") {
    if (!command.model) {
      const providerMessageId = await sendAndPersist({
        tenantId: params.tenantId,
        conversationId: state.conversation.id,
        phone: params.phone,
        instanceName,
        content: `Modelo atual: ${state.conversation.model ?? defaultModelFor(agentKind)}`,
        metadata: { agentKind, command: "model" },
      });
      return { status: "replied", providerMessageId };
    }
    await withAdmin(async (tx) => tx.whatsappAiConversation.update({
      where: { id: state.conversation.id },
      data: { model: command.model },
    }));
    const providerMessageId = await sendAndPersist({
      tenantId: params.tenantId,
      conversationId: state.conversation.id,
      phone: params.phone,
      instanceName,
      content: `Modelo atualizado para ${command.model}.`,
      metadata: { agentKind, command: "model" },
    });
    return { status: "replied", providerMessageId };
  }

  if (command.type === "status" || command.type === "config") {
    const latestExecution = await withAdmin(async (tx) => tx.whatsappAiExecution.findFirst({
      where: { tenantId: params.tenantId, conversationId: state.conversation.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true, createdAt: true },
    }));
    const lines = [
      `Agente: ${agentKind === "claude_code" ? "Claude Code servidor" : "Assistente Claude"}`,
      `Telefone: ${params.phone}`,
      `Pausado: ${state.conversation.paused ? "sim" : "não"}`,
      `Modelo: ${state.conversation.model ?? defaultModelFor(agentKind)}`,
      latestExecution ? `Última execução: ${latestExecution.id} (${latestExecution.status})` : "Última execução: nenhuma",
    ];
    const providerMessageId = await sendAndPersist({
      tenantId: params.tenantId,
      conversationId: state.conversation.id,
      phone: params.phone,
      instanceName,
      content: lines.join("\n"),
      metadata: { agentKind, command: command.type },
    });
    return { status: "replied", providerMessageId };
  }

  if (command.type === "reset") {
    const providerMessageId = await sendAndPersist({
      tenantId: params.tenantId,
      conversationId: state.conversation.id,
      phone: params.phone,
      instanceName,
      content: "Histórico mantido para auditoria. A próxima resposta usará apenas o contexto recente.",
      metadata: { agentKind, command: "reset" },
    });
    return { status: "replied", providerMessageId };
  }

  if (agentKind === "claude_code") {
    const task = command.type === "run" ? command.task : params.message.text;
    if (command.type !== "run" && !codeAutoRunEnabled()) {
      const providerMessageId = await sendAndPersist({
        tenantId: params.tenantId,
        conversationId: state.conversation.id,
        phone: params.phone,
        instanceName,
        content: "Envie /run <tarefa> para executar no Claude Code.",
        metadata: { agentKind, command: "run_required" },
      });
      return { status: "replied", providerMessageId };
    }
    if (!task.trim()) {
      const providerMessageId = await sendAndPersist({
        tenantId: params.tenantId,
        conversationId: state.conversation.id,
        phone: params.phone,
        instanceName,
        content: "Informe a tarefa após /run.",
        metadata: { agentKind, command: "run" },
      });
      return { status: "replied", providerMessageId };
    }

    const result = await dispatchClaudeCodeExecution({
      tenantId: params.tenantId,
      conversationId: state.conversation.id,
      phone: params.phone,
      instanceName,
      message: params.message,
      task,
    });
    return { status: "queued", executionId: result.executionId, providerMessageId: result.providerMessageId };
  }

  const historyWithoutCurrent = toClaudeHistory(state.history).slice(0, -1);
  let images;
  try {
    images = await validateWhatsappAiImages(params.message.attachments);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn("WhatsApp IA: imagem recebida não passou na validação", {
      conversationId: state.conversation.id,
      phone: params.phone,
      instanceName,
      error: message,
    });
    const providerMessageId = await sendAndPersist({
      tenantId: params.tenantId,
      conversationId: state.conversation.id,
      phone: params.phone,
      instanceName,
      content: "Recebi a imagem, mas não consegui processá-la com segurança. Envie novamente em JPG, PNG ou WebP.",
      metadata: { agentKind, imageValidationFailed: true },
    });
    return { status: "replied", providerMessageId };
  }

  const reply = await generateWhatsappAiReply({
    history: historyWithoutCurrent,
    userMessage: params.message.text,
    images,
    model: state.conversation.model,
    toolContext: {
      tenantId: params.tenantId,
      conversationId: state.conversation.id,
      phone: params.phone,
    },
  });

  const providerMessageId = await sendAndPersist({
    tenantId: params.tenantId,
    conversationId: state.conversation.id,
    phone: params.phone,
    instanceName,
    content: reply.text,
    metadata: {
      agentKind,
      imageAnalyzed: images.length > 0,
      toolsUsed: reply.toolExecutions.map((execution) => execution.name),
      toolExecutions: reply.toolExecutions,
    },
  });

  logger.info("WhatsApp IA: mensagem respondida", {
    conversationId: state.conversation.id,
    phone: params.phone,
    instanceName,
    agentKind,
    providerMessageId,
  });

  return { status: "replied", providerMessageId };
}
