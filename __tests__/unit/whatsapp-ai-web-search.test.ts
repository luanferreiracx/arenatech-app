import { beforeEach, describe, expect, it, vi } from "vitest";
import { webSearchTool } from "@/lib/whatsapp-ai-agent/tools/web-search";
import { normalizeWebSearchResult, webSearchMode } from "@/lib/whatsapp-ai-agent/web-search/provider";
import { createAnthropicWebSearchToolDefinition } from "@/lib/whatsapp-ai-agent/web-search/anthropic";

const originalEnv = process.env;

describe("whatsapp-ai web search", () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("respeita modo disabled", async () => {
    process.env.WHATSAPP_AI_ENABLE_WEB_SEARCH = "false";
    process.env.WHATSAPP_AI_WEB_SEARCH_MODE = "provider";

    const result = await webSearchTool.execute({ query: "notícias de tecnologia", topK: 2 }, {
      tenantId: "tenant-1",
      conversationId: "conv-1",
      phone: "5586995423021",
    });

    expect(result.content).toContain("não está configurada");
    expect(result.metadata).toMatchObject({ reason: "disabled" });
  });

  it("normaliza resultados e rejeita URL inválida", () => {
    expect(normalizeWebSearchResult({
      title: " Resultado ",
      url: "https://www.exemplo.com/path",
      snippet: " Resumo ",
    })).toEqual({
      title: "Resultado",
      url: "https://www.exemplo.com/path",
      domain: "exemplo.com",
      snippet: "Resumo",
    });

    expect(normalizeWebSearchResult({ title: "x", url: "javascript:alert(1)" })).toBeNull();
  });

  it("valida schema da tool", async () => {
    process.env.WHATSAPP_AI_ENABLE_WEB_SEARCH = "true";
    process.env.WHATSAPP_AI_WEB_SEARCH_MODE = "provider";

    const result = await webSearchTool.execute({ query: "oi", topK: 10 }, {
      tenantId: "tenant-1",
      conversationId: "conv-1",
      phone: "5586995423021",
    });

    expect(result.content).toContain("Entrada inválida");
  });

  it("monta server tool oficial Anthropic", () => {
    process.env.WHATSAPP_AI_WEB_SEARCH_ANTHROPIC_VERSION = "web_search_20260209";
    process.env.WHATSAPP_AI_WEB_SEARCH_MAX_USES = "4";
    process.env.WHATSAPP_AI_WEB_SEARCH_ALLOWED_DOMAINS = "anthropic.com,docs.anthropic.com";

    expect(createAnthropicWebSearchToolDefinition()).toEqual({
      type: "web_search_20260209",
      name: "web_search",
      max_uses: 4,
      allowed_domains: ["anthropic.com", "docs.anthropic.com"],
    });
  });

  it("normaliza modo desconhecido para disabled", () => {
    process.env.WHATSAPP_AI_WEB_SEARCH_MODE = "qualquer";
    expect(webSearchMode()).toBe("disabled");
  });
});
