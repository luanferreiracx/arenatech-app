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
import { recordTalisonMetric } from "@/lib/talison/metrics";
import type { LlmMessage, LlmProvider } from "@/lib/talison/types";
import { buildSystemPrompt, type PromptContext } from "@/lib/talison/prompt";
import { getTool, getToolDefinitions } from "@/lib/talison/tools/registry";
import type { TalisonToolContext } from "@/lib/talison/tools/contract";

const MAX_ITERATIONS = 5;
const FALLBACK_MESSAGE =
  "Tive um probleminha pra te responder agora. Vou chamar um atendente pra te ajudar, tá?";

/** Tools cujo retorno legitimamente contém valores em dinheiro. */
const PRICE_TOOLS = new Set([
  "estimar_orcamento",
  "listar_servicos",
  "buscar_aparelho",
  "buscar_acessorio",
  // "calcular_avaliacao" é o nome real no registry — a lista tinha
  // "consultar_avaliacao", que não existe, e por isso toda avaliação de troca
  // caía como preço suspeito.
  "calcular_avaliacao",
  "simular_parcelamento",
  "consultar_status_os",
]);

/**
 * Equação em dinheiro montada na resposta ("R$ 7.799,99 - R$ 3.150,00 ="). O bot
 * não faz conta: diferença de troca sai de `simular_parcelamento`. A guarda de
 * preço não pega esse caso, porque as tools de preço de fato rodaram — o que
 * falta é a tool de CÁLCULO.
 */
const MATH_PATTERN = /R\$\s*[\d.,]+\s*[-–−+]\s*R\$\s*[\d.,]+\s*=/;
const CALC_TOOL = "simular_parcelamento";

/** Detecta valor monetário em texto (R$ 1.234,56 / R$1234 / 4.299,99 reais). */
const MONEY_PATTERN = /R\$\s*\d|\d[\d.]*,\d{2}\s*(?:reais|no pix|no cart)/i;

export type TalisonRunResult = {
  /** Texto a enviar ao cliente. Sempre presente (fallback em erro). */
  reply: string;
  /** Quantas vezes o modelo foi chamado. */
  iterations: number;
  /** Nomes das tools executadas, em ordem (telemetria). */
  toolsUsed: string[];
  /** Se terminou por fallback (erro), não por resposta natural. */
  degraded: boolean;
  /** Resposta cita valor em dinheiro sem nenhuma tool de preço ter rodado (risco de alucinação). */
  suspiciousPrice: boolean;
  /** Resposta montou equação em dinheiro sem a tool de cálculo ter rodado. */
  computedMath: boolean;
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
    // Não vaze o erro técnico pro cliente: instrua o modelo a seguir natural.
    return JSON.stringify({
      ok: false,
      reason:
        "A ação não pôde ser concluída agora. NÃO mencione erro técnico ao cliente; " +
        "siga o atendimento naturalmente (ex.: informe que um atendente dará sequência).",
    });
  }
}

export async function runTalison(args: TalisonRunArgs): Promise<TalisonRunResult> {
  const { provider, toolContext, promptContext, history } = args;
  const toolsUsed: string[] = [];
  // TL-1: soma o consumo das ITERAÇÕES — o custo de uma resposta é o do laço
  // inteiro, não o da última chamada. Sem isto, um diálogo que gastou 5 rodadas
  // de tool-call parecia igual a um que respondeu de primeira.
  let inputTokens = 0;
  let outputTokens = 0;
  const emitirConsumo = (iterations: number, degraded: boolean) => {
    if (inputTokens === 0 && outputTokens === 0) return;
    recordTalisonMetric("tokens", {
      conversationId: toolContext.conversation.id,
      tenantId: toolContext.tenantId,
      model: provider.name,
      iterations,
      toolsUsed: toolsUsed.length,
      inputTokens,
      outputTokens,
      degraded,
    });
  };

  const messages: LlmMessage[] = [
    { role: "system", content: buildSystemPrompt(promptContext) },
    ...history,
  ];
  const toolDefinitions = getToolDefinitions();

  try {
    for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
      const completion = await provider.chat({ messages, tools: toolDefinitions });
      inputTokens += completion.usage?.inputTokens ?? 0;
      outputTokens += completion.usage?.outputTokens ?? 0;

      // Sem tool calls → resposta final.
      if (completion.toolCalls.length === 0) {
        const reply = completion.text.trim();
        if (!reply) {
          // Modelo não pediu tool nem respondeu — fail-safe.
          emitirConsumo(iteration, true);
          return { reply: FALLBACK_MESSAGE, iterations: iteration, toolsUsed, degraded: true, suspiciousPrice: false, computedMath: false };
        }
        // Guarda anti-alucinação: valor em dinheiro na resposta sem nenhuma tool de
        // preço ter rodado é forte sinal de número inventado. Não bloqueia (o cliente
        // pode ter dito o valor), mas marca pra telemetria/auditoria.
        const suspiciousPrice = MONEY_PATTERN.test(reply) && !toolsUsed.some((t) => PRICE_TOOLS.has(t));
        if (suspiciousPrice) {
          logger.warn("Talison: valor em dinheiro sem tool de preço", {
            conversationId: toolContext.conversation.id,
            toolsUsed,
            replyPreview: reply.slice(0, 160),
          });
        }
        emitirConsumo(iteration, false);
        const computedMath = MATH_PATTERN.test(reply) && !toolsUsed.includes(CALC_TOOL);
        if (computedMath) {
          logger.warn("Talison: conta em dinheiro feita sem tool de cálculo", {
            conversationId: toolContext.conversation.id,
            toolsUsed,
            replyPreview: reply.slice(0, 160),
          });
        }
        return { reply, iterations: iteration, toolsUsed, degraded: false, suspiciousPrice, computedMath };
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
    emitirConsumo(MAX_ITERATIONS, true);
    return { reply: FALLBACK_MESSAGE, iterations: MAX_ITERATIONS, toolsUsed, degraded: true, suspiciousPrice: false, computedMath: false };
  } catch (error) {
    logger.error("Talison: loop falhou", {
      conversationId: toolContext.conversation.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return { reply: FALLBACK_MESSAGE, iterations: 0, toolsUsed, degraded: true, suspiciousPrice: false, computedMath: false };
  }
}
