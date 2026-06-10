/**
 * Cliente mínimo da API do Chatwoot — o canal de saída do Talison.
 *
 * O agente responde postando uma mensagem `outgoing` na conversa (mantém
 * histórico unificado e handoff natural). Também muda status / atribui
 * quando transfere pra humano.
 *
 * Sem CHATWOOT_BOT_TOKEN, opera em mock mode (dev/CI).
 */

import { logger } from "@/lib/logger";

const REQUEST_TIMEOUT_MS = 15_000;

type ChatwootConfig = { url: string; accountId: string; botToken: string };

function getConfig(): ChatwootConfig | null {
  const url = process.env.CHATWOOT_URL;
  const accountId = process.env.CHATWOOT_ACCOUNT_ID;
  const botToken = process.env.CHATWOOT_BOT_TOKEN;
  if (!url || !accountId || !botToken) return null;
  return { url: url.replace(/\/$/, ""), accountId, botToken };
}

async function chatwootFetch(
  path: string,
  body: Record<string, unknown>,
): Promise<boolean> {
  const config = getConfig();
  if (!config) {
    logger.info("Chatwoot: mock mode (sem CHATWOOT_BOT_TOKEN)", { path });
    return true;
  }

  try {
    const response = await fetch(`${config.url}/api/v1/accounts/${config.accountId}${path}`, {
      method: "POST",
      headers: { api_access_token: config.botToken, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      logger.error("Chatwoot: HTTP error", { path, status: response.status });
      return false;
    }
    return true;
  } catch (error) {
    logger.error("Chatwoot: request failed", {
      path,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/** Posta a resposta do bot na conversa (mensagem outgoing). */
export async function sendBotMessage(
  conversationId: string,
  content: string,
): Promise<boolean> {
  return chatwootFetch(`/conversations/${conversationId}/messages`, {
    content,
    message_type: "outgoing",
  });
}

/**
 * Posta uma NOTA PRIVADA na conversa (visível só pros atendentes, nunca vai
 * pro cliente). Usado pra dar contexto ao humano — ex.: transcrição de áudio.
 */
export async function sendPrivateNote(
  conversationId: string,
  content: string,
): Promise<boolean> {
  return chatwootFetch(`/conversations/${conversationId}/messages`, {
    content,
    message_type: "outgoing",
    private: true,
  });
}

/** Muda o status da conversa (open | resolved | pending). */
export async function toggleStatus(
  conversationId: string,
  status: "open" | "resolved" | "pending",
): Promise<boolean> {
  return chatwootFetch(`/conversations/${conversationId}/toggle_status`, { status });
}
