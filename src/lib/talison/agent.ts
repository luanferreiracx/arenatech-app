/**
 * Loop do agente Talison — o cérebro.
 *
 * Recebe o provider, o contexto e o histórico já montado, e roda o ciclo:
 *   chama o modelo → se pediu tools, executa e devolve resultados → repete
 * até o modelo dar texto final ou bater o teto de iterações.
 *
 * Propositalmente PURO em relação à infraestrutura: não toca Prisma nem
 * Chatwoot direto. Quem carrega histórico e envia a resposta é o runner
 * (Fase 4). Isso deixa o loop testável com um provider fake.
 */

import { logger } from "@/lib/logger";
import type { LlmMessage, LlmProvider } from "@/lib/talison/types";
import { buildSystemPrompt, type PromptContext } from "@/lib/talison/prompt";
import { getTool, getToolDefinitions } from "@/lib/talison/tools/registry";
import type { TalisonToolContext } from "@/lib/talison/tools/contract";

const MAX_ITERATIONS = 5;
const FALLBACK_MESSAGE =
  "Tive um probleminha pra te responder agora. Vou chamar um atendente pra te ajudar, tá?";

export type TalisonRunResult = {
  /** Texto a enviar ao cliente. Sempre presente (fallback em erro). */
  reply: string;
  /** Quantas vezes o modelo foi chamado. */
  iterations: number;
  /** Nomes das tools executadas, em ordem (telemetria). */
  toolsUsed: string[];
  /** Se terminou por fallback (erro), não por resposta natural. */
  degraded: boolean;
};

export type TalisonRunArgs = {
  provider: LlmProvider;
  toolContext: TalisonToolContext;
  promptContext: PromptContext;
  /** Histórico da conversa (sem o system prompt — ele é injetado aqui). */
  history: LlmMessage[];
};

/** Executa uma tool pelo nome, validando args com o schema Zod dela. */
async function runTool(
  name: string,
  rawArgs: Record<string, unknown>,
  ctx: TalisonToolContext,
): Promise<string> {
  const tool = getTool(name);
  if (!tool) {
    return JSON.stringify({ ok: false, reason: `Tool desconhecida: ${name}` });
  }

  const parsed = tool.schema.safeParse(rawArgs);
  if (!parsed.success) {
    return JSON.stringify({
      ok: false,
      reason: `Argumentos inválidos para ${name}: ${parsed.error.message}`,
    });
  }

  try {
    const result = await tool.execute(parsed.data, ctx);
    if (result.ok) {
      return JSON.stringify({ ok: true, resultado: result.display, dados: result.data });
    }
    return JSON.stringify({ ok: false, reason: result.reason });
  } catch (error) {
    logger.error("Talison: tool falhou", {
      tool: name,
      error: error instanceof Error ? error.message : String(error),
    });
    return JSON.stringify({ ok: false, reason: "Erro interno ao executar a ação." });
  }
}

export async function runTalison(args: TalisonRunArgs): Promise<TalisonRunResult> {
  const { provider, toolContext, promptContext, history } = args;
  const toolsUsed: string[] = [];

  const messages: LlmMessage[] = [
    { role: "system", content: buildSystemPrompt(promptContext) },
    ...history,
  ];
  const toolDefinitions = getToolDefinitions();

  try {
    for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
      const completion = await provider.chat({ messages, tools: toolDefinitions });

      // Sem tool calls → resposta final.
      if (completion.toolCalls.length === 0) {
        const reply = completion.text.trim();
        if (!reply) {
          // Modelo não pediu tool nem respondeu — fail-safe.
          return { reply: FALLBACK_MESSAGE, iterations: iteration, toolsUsed, degraded: true };
        }
        return { reply, iterations: iteration, toolsUsed, degraded: false };
      }

      // Registra a mensagem do assistant com as tool calls, depois os resultados.
      messages.push({
        role: "assistant",
        content: completion.text,
        toolCalls: completion.toolCalls,
      });

      for (const call of completion.toolCalls) {
        toolsUsed.push(call.name);
        const result = await runTool(call.name, call.arguments, toolContext);
        messages.push({ role: "tool", toolCallId: call.id, content: result });
      }
    }

    // Estourou o teto sem resposta final — fail-safe.
    logger.warn("Talison: teto de iterações atingido", {
      conversationId: toolContext.conversation.id,
      toolsUsed,
    });
    return { reply: FALLBACK_MESSAGE, iterations: MAX_ITERATIONS, toolsUsed, degraded: true };
  } catch (error) {
    logger.error("Talison: loop falhou", {
      conversationId: toolContext.conversation.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return { reply: FALLBACK_MESSAGE, iterations: 0, toolsUsed, degraded: true };
  }
}
