import Anthropic from "@anthropic-ai/sdk";
import { logger } from "@/lib/logger";
import type { ValidatedWhatsappAiImage } from "@/lib/whatsapp-ai-agent/media";
import { getWhatsappAiTool, getWhatsappAiToolDefinitions } from "@/lib/whatsapp-ai-agent/tools/registry";
import type { AnthropicToolDefinition, WhatsappAiToolContext, WhatsappAiToolExecution } from "@/lib/whatsapp-ai-agent/tools/types";
import { createAnthropicWebSearchToolDefinition } from "@/lib/whatsapp-ai-agent/web-search/anthropic";
import { webSearchEnabled, webSearchMode } from "@/lib/whatsapp-ai-agent/web-search/provider";

export type WhatsappAiHistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

export type WhatsappAiReplyResult = {
  text: string;
  toolExecutions: WhatsappAiToolExecution[];
};

type ClaudeConfig = {
  apiKey: string;
  baseURL?: string;
  model: string;
};

type ClaudeTextBlock = {
  type: "text";
  text: string;
};

type ClaudeImageBlock = {
  type: "image";
  source:
    | {
        type: "url";
        url: string;
      }
    | {
        type: "base64";
        media_type: ValidatedWhatsappAiImage["mediaType"];
        data: string;
      };
};

type ClaudeToolUseBlock = {
  type: "tool_use";
  id: string;
  name: string;
  input: unknown;
};

type ClaudeToolResultBlock = {
  type: "tool_result";
  tool_use_id: string;
  content: string;
};

type ClaudeContentBlock = ClaudeTextBlock | ClaudeImageBlock | ClaudeToolResultBlock;

type ClaudeMessageParam = {
  role: "user" | "assistant";
  content: string | ClaudeContentBlock[];
};

type ClaudeServerToolUseBlock = {
  type: "server_tool_use";
  id: string;
  name: string;
  input?: unknown;
};

type ClaudeWebSearchToolResultBlock = {
  type: "web_search_tool_result";
  tool_use_id?: string;
  content?: unknown;
};

type ClaudeResponseContentBlock = ClaudeTextBlock | ClaudeToolUseBlock | ClaudeServerToolUseBlock | ClaudeWebSearchToolResultBlock | { type: string };

const DEFAULT_MODEL = "claude-opus-4-8";
const MAX_TOKENS = 2048;
const REQUEST_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_TOOL_ROUNDS = 3;

const SYSTEM_PROMPT = `Você é um assistente pessoal de IA acessado pelo WhatsApp pelo dono da Arena Tech.
Responda sempre em português do Brasil, de forma direta e útil.
Você está em uma conversa de WhatsApp: evite respostas longas demais quando não forem necessárias.
Você pode analisar imagens enviadas pelo usuário quando elas estiverem disponíveis.
Você pode usar pesquisa web apenas quando a pergunta depender de informação atual, verificação factual recente ou fontes externas.
Quando o usuário pedir explicitamente para pesquisar, buscar, consultar, verificar na web ou procurar informação atual, use a ferramenta web_search antes de responder.
Quando usar pesquisa web, mencione de forma curta as fontes/domínios usados.
Se a pesquisa web estiver habilitada no request, não diga que não consegue pesquisar em tempo real; tente usar a ferramenta primeiro.
Não execute ações externas, comandos, deploys, alterações em arquivos, exclusões ou operações administrativas.
Se o usuário pedir uma ação sensível, explique que nesta versão do assistente pessoal você apenas conversa e oriente a usar o canal Claude Code autorizado.
Nunca revele, solicite ou registre chaves de API, tokens, senhas ou segredos.`;

function getClaudeConfig(): ClaudeConfig | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  return {
    apiKey,
    baseURL: usesAnthropicWebSearch() ? undefined : process.env.ANTHROPIC_BASE_URL?.trim() || undefined,
    model: process.env.WHATSAPP_AI_ASSISTANT_MODEL?.trim() || process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL,
  };
}

function buildClient(config: ClaudeConfig): Anthropic {
  return new Anthropic({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
    timeout: REQUEST_TIMEOUT_MS,
  });
}

function maxToolRounds(): number {
  const configured = Number(process.env.WHATSAPP_AI_MAX_TOOL_ROUNDS);
  if (Number.isInteger(configured) && configured >= 0 && configured <= 5) return configured;
  return DEFAULT_MAX_TOOL_ROUNDS;
}

function buildUserContent(text: string, images: ValidatedWhatsappAiImage[]): ClaudeContentBlock[] | string {
  if (images.length === 0) return text;

  const blocks: ClaudeContentBlock[] = [];
  if (text.trim()) blocks.push({ type: "text", text: text.trim() });
  for (const image of images) {
    blocks.push({
      type: "image",
      source: {
        type: "base64",
        media_type: image.mediaType,
        data: image.base64Data,
      },
    });
  }
  if (blocks.length === images.length) {
    blocks.unshift({ type: "text", text: "Analise a imagem enviada." });
  }
  return blocks;
}

function extractText(content: ClaudeResponseContentBlock[]): string {
  return content
    .filter((block): block is ClaudeTextBlock => block.type === "text" && typeof (block as { text?: unknown }).text === "string")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

function buildToolDefinitions(context: WhatsappAiToolContext | undefined): AnthropicToolDefinition[] {
  if (!context || !webSearchEnabled()) return [];
  if (webSearchMode() === "anthropic") {
    return [createAnthropicWebSearchToolDefinition() as unknown as AnthropicToolDefinition];
  }
  if (webSearchMode() === "provider") return getWhatsappAiToolDefinitions();
  return [];
}

function usesAnthropicWebSearch(): boolean {
  return webSearchEnabled() && webSearchMode() === "anthropic";
}

function countAnthropicWebSearchUses(content: ClaudeResponseContentBlock[]): number {
  return content.filter((block) => block.type === "server_tool_use" && (block as { name?: unknown }).name === "web_search").length;
}

function hasWebSearchToolResult(content: ClaudeResponseContentBlock[]): boolean {
  return content.some((block) => block.type === "web_search_tool_result");
}

function extractToolUses(content: ClaudeResponseContentBlock[]): ClaudeToolUseBlock[] {
  return content.filter((block): block is ClaudeToolUseBlock => (
    block.type === "tool_use" &&
    typeof (block as { id?: unknown }).id === "string" &&
    typeof (block as { name?: unknown }).name === "string"
  ));
}

async function runToolUse(toolUse: ClaudeToolUseBlock, context: WhatsappAiToolContext): Promise<{ resultBlock: ClaudeToolResultBlock; execution: WhatsappAiToolExecution }> {
  const tool = getWhatsappAiTool(toolUse.name);
  if (!tool) {
    return {
      resultBlock: {
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: "Ferramenta não disponível.",
      },
      execution: { name: toolUse.name, ok: false, metadata: { reason: "unknown_tool" } },
    };
  }

  const result = await tool.execute(toolUse.input, context);
  return {
    resultBlock: {
      type: "tool_result",
      tool_use_id: toolUse.id,
      content: result.content,
    },
    execution: { name: tool.name, ok: true, metadata: result.metadata },
  };
}

export async function generateWhatsappAiReply(params: {
  history: WhatsappAiHistoryMessage[];
  userMessage: string;
  images?: ValidatedWhatsappAiImage[];
  model?: string | null;
  toolContext?: WhatsappAiToolContext;
}): Promise<WhatsappAiReplyResult> {
  const config = getClaudeConfig();
  if (!config) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("ANTHROPIC_API_KEY ausente para o agente WhatsApp IA");
    }
    logger.info("WhatsApp IA: mock mode (sem ANTHROPIC_API_KEY)");
    return { text: `Recebi: ${params.userMessage || "imagem enviada"}`, toolExecutions: [] };
  }

  const client = buildClient(config);
  const tools = buildToolDefinitions(params.toolContext);
  const toolExecutions: WhatsappAiToolExecution[] = [];
  const messages: ClaudeMessageParam[] = [
    ...params.history,
    { role: "user", content: buildUserContent(params.userMessage, params.images ?? []) },
  ];

  let lastText = "";
  for (let round = 0; round <= maxToolRounds(); round += 1) {
    const request = {
      model: params.model?.trim() || config.model,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages,
      ...(tools.length > 0 ? { tools } : {}),
    };
    const message = await client.messages.create(request as never);
    const content = message.content as ClaudeResponseContentBlock[];
    const text = extractText(content);
    if (text) lastText = text;

    if (usesAnthropicWebSearch()) {
      const searchUses = countAnthropicWebSearchUses(content);
      if (searchUses > 0 || hasWebSearchToolResult(content)) {
        toolExecutions.push({
          name: "web_search",
          ok: true,
          metadata: { provider: "anthropic", serverToolUses: searchUses },
        });
      }
      if ((message as { stop_reason?: unknown }).stop_reason === "pause_turn" && round < maxToolRounds()) {
        messages.push({ role: "assistant", content: content as unknown as ClaudeContentBlock[] });
        continue;
      }
    }

    const toolUses = extractToolUses(content);
    if (toolUses.length === 0 || !params.toolContext || round === maxToolRounds()) {
      return {
        text: text || lastText || "Não consegui gerar uma resposta agora.",
        toolExecutions,
      };
    }

    messages.push({ role: "assistant", content: content as unknown as ClaudeContentBlock[] });
    const toolResultBlocks: ClaudeToolResultBlock[] = [];
    for (const toolUse of toolUses) {
      const { resultBlock, execution } = await runToolUse(toolUse, params.toolContext);
      toolResultBlocks.push(resultBlock);
      toolExecutions.push(execution);
    }
    messages.push({ role: "user", content: toolResultBlocks });
  }

  return { text: lastText || "Não consegui gerar uma resposta agora.", toolExecutions };
}
