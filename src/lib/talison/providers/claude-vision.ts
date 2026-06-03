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
const MAX_TOKENS = 512;
const REQUEST_TIMEOUT_MS = 30_000;

const DEFAULT_PROMPT =
  "Descreva objetivamente o que aparece nesta imagem, focando no estado " +
  "físico do aparelho (tela, carcaça, danos visíveis). Não invente dados " +
  "que não dá pra ver. Responda em português, em uma frase.";

type VisionConfig = { apiKey: string; model: string };

function getConfig(): VisionConfig | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  return {
    apiKey,
    model: process.env.ANTHROPIC_VISION_MODEL ?? DEFAULT_VISION_MODEL,
  };
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

      const message = await client.messages.create({
        model: config.model,
        max_tokens: MAX_TOKENS,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "url", url: imageUrl } },
              { type: "text", text: prompt ?? DEFAULT_PROMPT },
            ],
          },
        ],
      });

      const text = message.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join(" ")
        .trim();

      return text || "Não foi possível descrever a imagem.";
    },
  };
}
