import { z } from "zod";
import { logger } from "@/lib/logger";
import type { WhatsappAiTool, WhatsappAiToolResult } from "@/lib/whatsapp-ai-agent/tools/types";
import { createFallbackWebSearchProvider } from "@/lib/whatsapp-ai-agent/web-search/fallback";
import { webSearchEnabled, webSearchMode, type WebSearchResult } from "@/lib/whatsapp-ai-agent/web-search/provider";

const webSearchInputSchema = z.object({
  query: z.string().trim().min(3).max(300),
  topK: z.number().int().min(1).max(5).optional().default(3),
});

function createProvider() {
  if (!webSearchEnabled()) return null;
  if (webSearchMode() === "provider") return createFallbackWebSearchProvider();
  return null;
}

function formatResults(results: WebSearchResult[]): string {
  if (results.length === 0) return "Nenhum resultado encontrado.";
  return results
    .map((result, index) => `${index + 1}. ${result.title}\nFonte: ${result.domain}\nURL: ${result.url}\nResumo: ${result.snippet || "Sem resumo disponível."}`)
    .join("\n\n");
}

export const webSearchTool: WhatsappAiTool = {
  name: "web_search",
  definition: {
    name: "web_search",
    description: "Pesquisa a web para responder perguntas que dependem de informação atual. Use apenas quando necessário e cite as fontes retornadas.",
    input_schema: z.toJSONSchema(webSearchInputSchema) as never,
  },
  inputSchema: webSearchInputSchema,
  async execute(input): Promise<WhatsappAiToolResult> {
    const parsed = webSearchInputSchema.safeParse(input);
    if (!parsed.success) {
      return { content: "Entrada inválida para pesquisa web.", metadata: { reason: "invalid_input" } };
    }

    const provider = createProvider();
    if (!provider) {
      return { content: "Pesquisa web não está configurada neste ambiente.", metadata: { reason: "disabled" } };
    }

    try {
      const results = await provider.search(parsed.data);
      return {
        content: formatResults(results),
        metadata: {
          resultCount: results.length,
          domains: results.map((result) => result.domain),
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn("WhatsApp IA: falha em web_search", { error: message });
      return {
        content: "Não consegui concluir a pesquisa web agora.",
        metadata: { reason: "provider_error" },
      };
    }
  },
};
