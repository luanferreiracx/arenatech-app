import Anthropic from "@anthropic-ai/sdk";
import { logger } from "@/lib/logger";

export type WhatsappAiHistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

const DEFAULT_MODEL = "claude-opus-4-8";
const MAX_TOKENS = 2048;
const REQUEST_TIMEOUT_MS = 60_000;

const SYSTEM_PROMPT = `Você é um assistente pessoal de IA acessado pelo WhatsApp pelo dono da Arena Tech.
Responda sempre em português do Brasil, de forma direta e útil.
Você está em uma conversa de WhatsApp: evite respostas longas demais quando não forem necessárias.
Não execute ações externas, comandos, deploys, alterações em arquivos, exclusões ou operações administrativas.
Se o usuário pedir uma ação sensível, explique que nesta versão você apenas conversa e oriente a executar por um canal seguro.
Nunca revele, solicite ou registre chaves de API, tokens, senhas ou segredos.`;

type ClaudeConfig = {
  apiKey: string;
  baseURL?: string;
  model: string;
};

function getClaudeConfig(): ClaudeConfig | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  return {
    apiKey,
    baseURL: process.env.ANTHROPIC_BASE_URL?.trim() || undefined,
    model: process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL,
  };
}

function buildClient(config: ClaudeConfig): Anthropic {
  return new Anthropic({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
    timeout: REQUEST_TIMEOUT_MS,
  });
}

export async function generateWhatsappAiReply(params: {
  history: WhatsappAiHistoryMessage[];
  userMessage: string;
}): Promise<string> {
  const config = getClaudeConfig();
  if (!config) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("ANTHROPIC_API_KEY ausente para o agente WhatsApp IA");
    }
    logger.info("WhatsApp IA: mock mode (sem ANTHROPIC_API_KEY)");
    return `Recebi: ${params.userMessage}`;
  }

  const client = buildClient(config);
  const message = await client.messages.create({
    model: config.model,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [
      ...params.history,
      { role: "user" as const, content: params.userMessage },
    ],
  });

  const text = message.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();

  if (!text) return "Não consegui gerar uma resposta agora.";
  return text;
}
