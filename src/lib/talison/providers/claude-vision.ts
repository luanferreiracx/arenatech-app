/**
 * Claude — provider de visão do Talison.
 *
 * DeepSeek não enxerga imagem; quando o cliente manda foto (tela trincada,
 * etc), passamos a imagem pra cá e o Claude devolve uma descrição textual
 * que entra no contexto do DeepSeek. Visão só roda quando há imagem, então
 * o custo é pontual.
 *
 * Sem ANTHROPIC_API_KEY, opera em mock mode (dev/CI).
 */

import Anthropic from "@anthropic-ai/sdk";
import { logger } from "@/lib/logger";
import type { VisionProvider } from "@/lib/talison/types";

const DEFAULT_VISION_MODEL = "claude-haiku-4-5";
const DEFAULT_FALLBACK_MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 512;
const REQUEST_TIMEOUT_MS = 30_000;
const UNRESOLVED = "Não foi possível descrever a imagem.";

const DEFAULT_PROMPT =
  "Descreva objetivamente o que aparece nesta imagem, focando no estado " +
  "físico do aparelho (tela, carcaça, danos visíveis). Não invente dados " +
  "que não dá pra ver. Responda em português, em uma frase.";

type VisionConfig = { apiKey: string; model: string; fallbackModel: string };

function getConfig(): VisionConfig | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  return {
    apiKey,
    model: process.env.ANTHROPIC_VISION_MODEL ?? DEFAULT_VISION_MODEL,
    fallbackModel: process.env.ANTHROPIC_VISION_FALLBACK_MODEL ?? DEFAULT_FALLBACK_MODEL,
  };
}

async function describeWith(
  client: Anthropic,
  model: string,
  imageUrl: string,
  prompt: string,
): Promise<string> {
  const message = await client.messages.create({
    model,
    max_tokens: MAX_TOKENS,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "url", url: imageUrl } },
          { type: "text", text: prompt },
        ],
      },
    ],
  });

  return message.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join(" ")
    .trim();
}

export function createClaudeVisionProvider(): VisionProvider {
  return {
    name: "claude-vision",
    async describe({ imageUrl, prompt }) {
      const config = getConfig();
      if (!config) {
        logger.info("Claude vision: mock mode (sem ANTHROPIC_API_KEY)");
        return "[mock] imagem recebida (visão desativada em dev).";
      }

      const client = new Anthropic({ apiKey: config.apiKey, timeout: REQUEST_TIMEOUT_MS });
      const finalPrompt = prompt ?? DEFAULT_PROMPT;

      // Haiku primeiro (rápido/barato). Só escala pro Sonnet quando o Haiku falha
      // ou não resolve — decisão do dono: Sonnet apenas como fallback de visão.
      try {
        const text = await describeWith(client, config.model, imageUrl, finalPrompt);
        if (text) return text;
        logger.info("Claude vision: Haiku não resolveu, tentando Sonnet", { model: config.model });
      } catch (error) {
        logger.warn("Claude vision: Haiku falhou, tentando Sonnet", {
          model: config.model,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      if (config.fallbackModel && config.fallbackModel !== config.model) {
        try {
          const text = await describeWith(client, config.fallbackModel, imageUrl, finalPrompt);
          if (text) return text;
        } catch (error) {
          logger.warn("Claude vision: fallback Sonnet falhou", {
            model: config.fallbackModel,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      return UNRESOLVED;
    },
  };
}
