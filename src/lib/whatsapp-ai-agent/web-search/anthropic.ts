export type AnthropicWebSearchToolDefinition = {
  type: "web_search_20250305" | "web_search_20260209";
  name: "web_search";
  max_uses?: number;
  allowed_domains?: string[];
  blocked_domains?: string[];
  user_location?: {
    type: "approximate";
    city?: string;
    region?: string;
    country?: string;
    timezone?: string;
  };
  allowed_callers?: string[];
};

function parseCsv(value: string | undefined): string[] | undefined {
  const values = value
    ?.split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return values && values.length > 0 ? values : undefined;
}

function parseMaxUses(): number | undefined {
  const configured = Number(process.env.WHATSAPP_AI_WEB_SEARCH_MAX_USES);
  if (Number.isInteger(configured) && configured > 0 && configured <= 10) return configured;
  return 5;
}

export function createAnthropicWebSearchToolDefinition(): AnthropicWebSearchToolDefinition {
  const version = process.env.WHATSAPP_AI_WEB_SEARCH_ANTHROPIC_VERSION?.trim();
  const allowedDomains = parseCsv(process.env.WHATSAPP_AI_WEB_SEARCH_ALLOWED_DOMAINS);
  const blockedDomains = allowedDomains ? undefined : parseCsv(process.env.WHATSAPP_AI_WEB_SEARCH_BLOCKED_DOMAINS);

  return {
    type: version === "web_search_20260209" ? "web_search_20260209" : "web_search_20250305",
    name: "web_search",
    max_uses: parseMaxUses(),
    ...(allowedDomains ? { allowed_domains: allowedDomains } : {}),
    ...(blockedDomains ? { blocked_domains: blockedDomains } : {}),
  };
}
