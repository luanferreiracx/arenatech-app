import type { AnthropicToolDefinition, WhatsappAiTool } from "@/lib/whatsapp-ai-agent/tools/types";
import { webSearchTool } from "@/lib/whatsapp-ai-agent/tools/web-search";
import { webSearchEnabled, webSearchMode } from "@/lib/whatsapp-ai-agent/web-search/provider";

export function getWhatsappAiTools(): WhatsappAiTool[] {
  if (!webSearchEnabled() || webSearchMode() !== "provider") return [];
  return [webSearchTool];
}

export function getWhatsappAiToolDefinitions(): AnthropicToolDefinition[] {
  return getWhatsappAiTools().map((tool) => tool.definition);
}

export function getWhatsappAiTool(name: string): WhatsappAiTool | null {
  return getWhatsappAiTools().find((tool) => tool.name === name) ?? null;
}
