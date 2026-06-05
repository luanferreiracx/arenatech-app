export type WebSearchResult = {
  title: string;
  url: string;
  domain: string;
  snippet: string;
};

export type WebSearchProvider = {
  search: (params: { query: string; topK: number }) => Promise<WebSearchResult[]>;
};

export function webSearchEnabled(): boolean {
  return process.env.WHATSAPP_AI_ENABLE_WEB_SEARCH === "true";
}

export function webSearchMode(): "disabled" | "anthropic" | "provider" {
  const mode = process.env.WHATSAPP_AI_WEB_SEARCH_MODE?.trim();
  if (mode === "anthropic" || mode === "provider") return mode;
  return "disabled";
}

export function normalizeWebSearchResult(input: {
  title: string;
  url: string;
  snippet?: string | null;
}): WebSearchResult | null {
  let parsed: URL;
  try {
    parsed = new URL(input.url);
  } catch {
    return null;
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;

  const title = input.title.trim();
  if (!title) return null;

  return {
    title,
    url: parsed.toString(),
    domain: parsed.hostname.replace(/^www\./, ""),
    snippet: input.snippet?.trim().slice(0, 500) ?? "",
  };
}
