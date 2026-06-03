/**
 * DeepSeek — provider de conversa do Talison (OpenAI-compatible).
 *
 * Sem DEEPSEEK_API_KEY, opera em mock mode (dev/CI): devolve uma resposta
 * fixa sem chamar a rede, igual ao padrão do whatsapp-service. Isso mantém
 * testes e dev locais funcionando sem segredo.
 */

import OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import { logger } from "@/lib/logger";
import type {
  LlmCompletion,
  LlmMessage,
  LlmProvider,
  LlmToolCall,
  LlmToolDefinition,
} from "@/lib/talison/types";

const DEFAULT_MODEL = "deepseek-chat";
const DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_MAX_TOKENS = 1024;
const REQUEST_TIMEOUT_MS = 45_000;

type DeepSeekConfig = { apiKey: string; baseURL: string; model: string };

function getConfig(): DeepSeekConfig | null {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return null;
  return {
    apiKey,
    baseURL: process.env.DEEPSEEK_BASE_URL ?? DEFAULT_BASE_URL,
    model: process.env.DEEPSEEK_MODEL ?? DEFAULT_MODEL,
  };
}

/** Converte nossas LlmMessage no formato de mensagens do SDK OpenAI. */
function toOpenAiMessages(messages: LlmMessage[]): ChatCompletionMessageParam[] {
  return messages.map((message) => {
    if (message.role === "tool") {
      return {
        role: "tool",
        tool_call_id: message.toolCallId,
        content: message.content,
      };
    }
    if (message.role === "assistant") {
      const toolCalls = message.toolCalls?.map((call) => ({
        id: call.id,
        type: "function" as const,
        function: { name: call.name, arguments: JSON.stringify(call.arguments) },
      }));
      return {
        role: "assistant",
        content: message.content || null,
        ...(toolCalls?.length ? { tool_calls: toolCalls } : {}),
      };
    }
    return { role: message.role, content: message.content };
  });
}

function toOpenAiTools(tools: LlmToolDefinition[]): ChatCompletionTool[] {
  return tools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

/** Parse defensivo dos argumentos da tool — modelo pode emitir JSON inválido. */
function parseToolArguments(raw: string | undefined): Record<string, unknown> {
  if (!raw?.trim()) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    logger.warn("DeepSeek: argumentos de tool com JSON inválido", { raw: raw.slice(0, 200) });
    return {};
  }
}

function mockCompletion(): LlmCompletion {
  return {
    text: "[mock] Talison sem DEEPSEEK_API_KEY — resposta simulada.",
    toolCalls: [],
  };
}

export function createDeepSeekProvider(): LlmProvider {
  return {
    name: "deepseek",
    async chat({ messages, tools, maxTokens }) {
      const config = getConfig();
      if (!config) {
        logger.info("DeepSeek: mock mode (sem DEEPSEEK_API_KEY)");
        return mockCompletion();
      }

      const client = new OpenAI({
        apiKey: config.apiKey,
        baseURL: config.baseURL,
        timeout: REQUEST_TIMEOUT_MS,
      });

      const response = await client.chat.completions.create({
        model: config.model,
        max_tokens: maxTokens ?? DEFAULT_MAX_TOKENS,
        messages: toOpenAiMessages(messages),
        ...(tools?.length ? { tools: toOpenAiTools(tools) } : {}),
      });

      const choice = response.choices[0]?.message;
      const toolCalls: LlmToolCall[] = (choice?.tool_calls ?? [])
        .filter((call) => call.type === "function")
        .map((call) => ({
          id: call.id,
          name: call.function.name,
          arguments: parseToolArguments(call.function.arguments),
        }));

      return {
        text: choice?.content ?? "",
        toolCalls,
        usage: response.usage
          ? {
              inputTokens: response.usage.prompt_tokens,
              outputTokens: response.usage.completion_tokens,
            }
          : undefined,
      };
    },
  };
}
