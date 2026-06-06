import { normalizeWebSearchResult, type WebSearchProvider, type WebSearchResult } from "@/lib/whatsapp-ai-agent/web-search/provider";

const REQUEST_TIMEOUT_MS = 10_000;

type TavilyResponse = {
  results?: Array<{
    title?: unknown;
    url?: unknown;
    content?: unknown;
  }>;
};

function providerName(): string | null {
  return process.env.WHATSAPP_AI_WEB_SEARCH_PROVIDER?.trim().toLowerCase() || null;
}

async function searchTavily(params: { query: string; topK: number }): Promise<WebSearchResult[]> {
  const apiKey = process.env.TAVILY_API_KEY?.trim();
  if (!apiKey) throw new Error("TAVILY_API_KEY ausente");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query: params.query,
        max_results: params.topK,
        search_depth: "basic",
        include_answer: false,
        include_raw_content: false,
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Busca Tavily falhou com HTTP ${response.status}`);
    }
    const body = (await response.json()) as TavilyResponse;
    return (body.results ?? [])
      .map((result) => normalizeWebSearchResult({
        title: typeof result.title === "string" ? result.title : "",
        url: typeof result.url === "string" ? result.url : "",
        snippet: typeof result.content === "string" ? result.content : "",
      }))
      .filter((result) => result !== null);
  } finally {
    clearTimeout(timeout);
  }
}

export function createFallbackWebSearchProvider(): WebSearchProvider | null {
  const provider = providerName();
  if (!provider) return null;

  if (provider === "tavily") {
    return { search: searchTavily };
  }

  return null;
}
