/**
 * Runner do Talison — a ponte entre infra (DB/Chatwoot) e o loop puro.
 *
 * Carrega histórico + config, decide se o bot deve responder (feature-flag,
 * whitelist, status da conversa), roda o loop, persiste a resposta como
 * mensagem do bot e envia ao Chatwoot.
 */

import { withAdmin, withTenant } from "@/server/db";
import { logger } from "@/lib/logger";
import { runTalison } from "@/lib/talison/agent";
import { createDeepSeekProvider } from "@/lib/talison/providers/deepseek";
import { createClaudeVisionProvider } from "@/lib/talison/providers/claude-vision";
import { sendBotMessage } from "@/lib/talison/chatwoot-client";
import type { LlmMessage } from "@/lib/talison/types";
import type { TalisonToolContext, TalisonTx } from "@/lib/talison/tools/contract";

const HISTORY_LIMIT = 20;

type StoredMessage = {
  direction: string;
  senderType: string;
  content: string;
  contentType: string;
  mediaUrl: string | null;
};

/**
 * Enriquece mensagens de imagem: DeepSeek não enxerga, então o Claude
 * descreve a foto e a descrição entra no texto. Visão só roda quando há
 * imagem com URL — custo pontual. Falha de visão não derruba o atendimento:
 * cai num placeholder e a conversa segue.
 */
async function describeImages(messages: StoredMessage[]): Promise<string[]> {
  const vision = createClaudeVisionProvider();
  return Promise.all(
    messages.map(async (message) => {
      if (message.contentType !== "image" || !message.mediaUrl) return message.content;
      try {
        const description = await vision.describe({ imageUrl: message.mediaUrl });
        const caption = message.content?.trim();
        return caption
          ? `${caption}\n[imagem enviada: ${description}]`
          : `[imagem enviada: ${description}]`;
      } catch (error) {
        logger.warn("Talison: visão falhou, seguindo sem descrição", {
          error: error instanceof Error ? error.message : String(error),
        });
        return message.content?.trim() || "[cliente enviou uma imagem]";
      }
    }),
  );
}

/** Mapeia uma ChatbotMessage (com texto já resolvido) para o papel do modelo. */
function toLlmMessage(message: StoredMessage, resolvedContent: string): LlmMessage | null {
  if (!resolvedContent.trim()) return null;
  if (message.senderType === "customer") return { role: "user", content: resolvedContent };
  if (message.senderType === "bot") return { role: "assistant", content: resolvedContent };
  // Mensagens de agente humano entram como contexto (o bot não fala por ele).
  if (message.senderType === "agent") {
    return { role: "assistant", content: `[atendente] ${resolvedContent}` };
  }
  return null;
}

export type TalisonProcessResult = {
  status: "replied" | "skipped";
  reason?: string;
};

/**
 * Processa uma conversa: gera a resposta do Talison e envia ao Chatwoot.
 * Idempotência/debounce é responsabilidade do caller (scheduler).
 */
export async function processConversation(
  tenantId: string,
  conversationId: string,
): Promise<TalisonProcessResult> {
  // Leitura de estado via admin (webhook não tem sessão de usuário).
  const state = await withAdmin(async (tx) => {
    const conversation = await tx.chatbotConversation.findFirst({
      where: { id: conversationId, tenantId },
    });
    if (!conversation) return null;

    const config = await tx.chatbotConfig.findUnique({ where: { tenantId } });
    const messages = await tx.chatbotMessage.findMany({
      where: { tenantId, conversationId },
      orderBy: { createdAt: "desc" },
      take: HISTORY_LIMIT,
      select: { direction: true, senderType: true, content: true, contentType: true, mediaUrl: true },
    });
    return { conversation, config, messages: messages.reverse() };
  });

  if (!state) return { status: "skipped", reason: "conversa não encontrada" };
  const { conversation, config, messages } = state;

  // Bot desativado por tenant.
  if (config && !config.enabled) return { status: "skipped", reason: "bot desativado" };

  // Regra (segue o status do Chatwoot, espelhado no webhook): o bot só NÃO
  // responde quando a conversa está OPEN (atendente no caso). pending
  // (BOT_ACTIVE) e resolved (RESOLVED) o bot atende — cliente voltando reabre.
  if (conversation.status === "OPEN") {
    return { status: "skipped", reason: "conversa OPEN (atendente no caso)" };
  }

  // Whitelist (modo teste): se populada, só responde os números listados.
  const whitelist = Array.isArray(config?.whitelistPhones)
    ? (config.whitelistPhones as unknown[]).map(String)
    : [];
  if (whitelist.length > 0) {
    const last9 = conversation.contactPhone.slice(-9);
    const allowed = whitelist.some((phone) => phone.replace(/\D/g, "").endsWith(last9));
    if (!allowed) return { status: "skipped", reason: "fora da whitelist" };
  }

  // A última mensagem precisa ser do cliente — senão não há o que responder.
  const lastMessage = messages.at(-1);
  if (!lastMessage || lastMessage.senderType !== "customer") {
    return { status: "skipped", reason: "última mensagem não é do cliente" };
  }

  // Descreve imagens via Claude e monta o histórico textual pro DeepSeek.
  const resolvedContents = await describeImages(messages);
  const history = messages
    .map((message, index) => toLlmMessage(message, resolvedContents[index] ?? message.content))
    .filter((m): m is LlmMessage => m !== null);

  const toolContext: TalisonToolContext = {
    tenantId,
    conversation: {
      id: conversation.id,
      contactPhone: conversation.contactPhone,
      contactName: conversation.contactName,
      customerId: conversation.customerId,
      externalId: conversation.externalId,
    },
    withTenant: <T>(fn: (tx: TalisonTx) => Promise<T>) => withTenant(tenantId, fn),
  };

  const result = await runTalison({
    provider: createDeepSeekProvider(),
    toolContext,
    promptContext: {
      contactName: conversation.contactName,
      businessHoursNote: config?.outOfHoursMessage ?? null,
    },
    history,
  });

  // Marca a conversa como atendida pelo bot e persiste a resposta.
  await withAdmin(async (tx) => {
    await tx.chatbotMessage.create({
      data: {
        tenantId,
        conversationId,
        direction: "outgoing",
        senderType: "bot",
        content: result.reply,
        contentType: "text",
      },
    });
    await tx.chatbotConversation.update({
      where: { id: conversationId },
      data: { status: "BOT_ACTIVE", lastMessageAt: new Date() },
    });
  });

  // Envia ao Chatwoot (fora da tx — chamada de rede).
  if (conversation.externalId) {
    await sendBotMessage(conversation.externalId, result.reply);
  }

  logger.info("Talison: conversa respondida", {
    conversationId,
    iterations: result.iterations,
    toolsUsed: result.toolsUsed,
    degraded: result.degraded,
  });

  return { status: "replied" };
}
