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
import { createGroqAudioProvider } from "@/lib/talison/providers/groq-audio";
import { sendBotMessage, sendPrivateNote } from "@/lib/talison/chatwoot-client";
import { buildTalisonBusinessContext } from "@/lib/talison/business-context";
import { buildNowNote } from "@/lib/talison/business-hours";
import { recordTalisonMetric } from "@/lib/talison/metrics";
import type { LlmMessage } from "@/lib/talison/types";
import type { TalisonToolContext, TalisonTx } from "@/lib/talison/tools/contract";

const HISTORY_LIMIT = 20;

type StoredMessage = {
  id: string;
  direction: string;
  senderType: string;
  content: string;
  contentType: string;
  mediaUrl: string | null;
  metadata: unknown;
};

/** Lê a transcrição/descrição já calculada da mídia (cache em metadata). */
function cachedMediaText(metadata: unknown): string | null {
  if (metadata && typeof metadata === "object" && "resolvedText" in metadata) {
    const value = (metadata as Record<string, unknown>).resolvedText;
    return typeof value === "string" && value.trim() ? value : null;
  }
  return null;
}

/**
 * Resolve uma mensagem de mídia em texto para o DeepSeek:
 *  - imagem → descrição via Claude (visão)
 *  - áudio  → transcrição via Groq (Whisper)
 *
 * Cacheia o resultado em ChatbotMessage.metadata.resolvedText pra não reprocessar
 * a mesma mídia a cada turno (custo e latência). Falha não derruba o atendimento:
 * cai num placeholder e a conversa segue.
 */
async function resolveMediaContents(
  messages: StoredMessage[],
  tenantId: string,
  conversationExternalId: string | null,
): Promise<string[]> {
  const vision = createClaudeVisionProvider();
  const audio = createGroqAudioProvider();

  return Promise.all(
    messages.map(async (message) => {
      const isImage = message.contentType === "image";
      const isAudio =
        message.contentType === "audio" || message.contentType.startsWith("audio/");
      const isVideo =
        message.contentType === "video" || message.contentType.startsWith("video/");

      // Vídeo (ou cliente que marcou a loja em vídeo/story): o modelo NÃO assiste
      // vídeo. Em vez de ficar mudo, instrui o bot a pedir descrição/foto ou
      // oferecer atendente. A legenda do cliente, se houver, é preservada.
      if (isVideo) {
        const caption = message.content?.trim();
        const note =
          "[cliente enviou um VÍDEO — você não consegue assistir vídeos. " +
          "Peça gentilmente para ele descrever em texto o que precisa OU enviar uma foto; " +
          "se for sobre um defeito/produto, ofereça transferir para um atendente.]";
        return caption ? `${caption}\n${note}` : note;
      }

      if ((!isImage && !isAudio) || !message.mediaUrl) return message.content;

      const cached = cachedMediaText(message.metadata);
      if (cached) return cached;

      const caption = message.content?.trim();
      let resolved: string;
      try {
        if (isImage) {
          const description = await vision.describe({ imageUrl: message.mediaUrl });
          resolved = caption
            ? `${caption}\n[imagem enviada: ${description}]`
            : `[imagem enviada: ${description}]`;
        } else {
          const transcription = await audio.transcribe({ audioUrl: message.mediaUrl });
          const spoken = transcription.trim();
          resolved = spoken
            ? `[áudio do cliente, transcrito]: ${spoken}`
            : caption || "[cliente enviou um áudio sem fala reconhecível]";
          // Mostra a transcrição ao atendente como nota privada no Chatwoot
          // (só os atendentes veem). Só na 1ª resolução (cacheia depois). Fora
          // do caminho crítico: falha aqui não atrapalha a resposta ao cliente.
          if (spoken && conversationExternalId) {
            void sendPrivateNote(
              conversationExternalId,
              `🎙️ *Áudio do cliente transcrito:*\n${spoken}`,
            ).catch((error) =>
              logger.warn("Talison: falha ao postar nota privada de áudio", {
                conversationExternalId,
                error: error instanceof Error ? error.message : String(error),
              }),
            );
          }
        }
      } catch (error) {
        logger.warn("Talison: resolução de mídia falhou, seguindo sem ela", {
          tipo: isImage ? "imagem" : "áudio",
          error: error instanceof Error ? error.message : String(error),
        });
        return caption || (isImage ? "[cliente enviou uma imagem]" : "[cliente enviou um áudio]");
      }

      // Persiste o cache numa transação curta (a chamada de rede já terminou) —
      // não segura transação durante visão/transcrição. Falha aqui não atrapalha.
      try {
        const baseMeta =
          message.metadata && typeof message.metadata === "object"
            ? (message.metadata as Record<string, unknown>)
            : {};
        await withAdmin((tx) =>
          tx.chatbotMessage.update({
            where: { id: message.id },
            data: { metadata: { ...baseMeta, resolvedText: resolved } },
          }),
        );
      } catch (error) {
        logger.warn("Talison: falha ao cachear resolução de mídia", {
          messageId: message.id,
          tenantId,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      return resolved;
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
  delivery?: "sent" | "failed" | "skipped";
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
    const [tenantSettings, tenantAssistanceSettings, messages] = await Promise.all([
      tx.tenantSettings.findUnique({ where: { tenantId } }),
      tx.tenantAssistanceSettings.findUnique({ where: { tenantId } }),
      tx.chatbotMessage.findMany({
        where: { tenantId, conversationId },
        orderBy: { createdAt: "desc" },
        take: HISTORY_LIMIT,
        select: { id: true, direction: true, senderType: true, content: true, contentType: true, mediaUrl: true, metadata: true },
      }),
    ]);
    return {
      conversation,
      config,
      tenantSettings,
      tenantAssistanceSettings,
      messages: messages.reverse(),
    };
  });

  if (!state) return { status: "skipped", reason: "conversa não encontrada" };
  const { conversation, config, messages, tenantSettings, tenantAssistanceSettings } = state;

  // Bot desativado por tenant.
  if (config && !config.enabled) return { status: "skipped", reason: "bot desativado" };

  // Regra (segue o status do Chatwoot, espelhado no webhook): o bot só NÃO
  // responde quando a conversa está OPEN (atendente no caso). pending
  // (BOT_ACTIVE) e resolved (RESOLVED) o bot atende — cliente voltando reabre.
  if (conversation.status === "OPEN") {
    recordTalisonMetric("skipped", { conversationId, reason: "open" });
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

  // Precisa haver mensagem do cliente AINDA NÃO respondida. Em vez de exigir que
  // a ÚLTIMA mensagem seja do cliente (frágil quando uma saudação/eco cai depois
  // da pergunta real), respondemos quando há mensagem do cliente após a última
  // resposta do bot/atendente — assim follow-ups do cliente não ficam órfãos.
  const lastRepliedIndex = messages.reduce(
    (acc, message, index) =>
      message.senderType === "bot" || message.senderType === "agent" ? index : acc,
    -1,
  );
  const hasUnansweredCustomer = messages
    .slice(lastRepliedIndex + 1)
    .some((message) => message.senderType === "customer");
  if (!hasUnansweredCustomer) {
    recordTalisonMetric("skipped", { conversationId, reason: "no_pending_customer" });
    return { status: "skipped", reason: "sem mensagem do cliente pendente de resposta" };
  }

  // Resolve mídia (imagem→visão, áudio→transcrição) e monta o histórico pro DeepSeek.
  // Rede fora de transação; o cache em metadata é gravado em tx curta lá dentro.
  const resolvedContents = await resolveMediaContents(messages, tenantId, conversation.externalId);
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

  const businessContext = buildTalisonBusinessContext({
    chatbotConfig: config,
    tenantSettings,
    tenantAssistanceSettings,
  });

  const result = await runTalison({
    provider: createDeepSeekProvider(),
    toolContext,
    promptContext: {
      contactName: conversation.contactName,
      businessContext,
      businessHoursNote: config?.outOfHoursMessage ?? null,
      nowNote: buildNowNote({
        start: config?.businessHoursStart ?? null,
        end: config?.businessHoursEnd ?? null,
      }),
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

  // Envia ao Chatwoot (fora da tx — chamada de rede). A mensagem local já foi
  // persistida para manter o histórico; se a entrega externa falhar, tornamos
  // isso observável no retorno/log para diagnóstico operacional.
  let delivery: TalisonProcessResult["delivery"] = "skipped";
  if (conversation.externalId) {
    const sent = await sendBotMessage(conversation.externalId, result.reply);
    delivery = sent ? "sent" : "failed";
    if (!sent) {
      logger.error("Talison: falha ao entregar resposta no Chatwoot", {
        conversationId,
        externalId: conversation.externalId,
        replyPreview: result.reply.slice(0, 120),
      });
      recordTalisonMetric("delivery_failed", { conversationId });
    }
  }

  recordTalisonMetric("replied", {
    conversationId,
    delivery,
    degraded: result.degraded,
    toolsUsed: result.toolsUsed,
  });
  if (result.degraded) recordTalisonMetric("degraded", { conversationId });
  if (result.suspiciousPrice) recordTalisonMetric("suspicious_price", { conversationId });

  logger.info("Talison: conversa respondida", {
    conversationId,
    iterations: result.iterations,
    toolsUsed: result.toolsUsed,
    degraded: result.degraded,
    suspiciousPrice: result.suspiciousPrice,
    delivery,
  });

  return { status: "replied", delivery };
}
