import type { z } from "zod";

export type AnthropicToolDefinition = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
};

export type WhatsappAiToolResult = {
  content: string;
  metadata?: Record<string, unknown>;
};

export type WhatsappAiToolContext = {
  tenantId: string;
  conversationId: string;
  phone: string;
};

export type WhatsappAiTool = {
  name: string;
  definition: AnthropicToolDefinition;
  inputSchema: z.ZodType;
  execute: (input: unknown, context: WhatsappAiToolContext) => Promise<WhatsappAiToolResult>;
};

export type WhatsappAiToolExecution = {
  name: string;
  ok: boolean;
  metadata?: Record<string, unknown>;
};
