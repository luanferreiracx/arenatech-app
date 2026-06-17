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
const DOWNLOAD_TIMEOUT_MS = 15_000;
// Teto de tamanho da imagem (Claude aceita até ~5MB por imagem em base64).
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const SUPPORTED_MEDIA_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
type SupportedMediaType = (typeof SUPPORTED_MEDIA_TYPES)[number];
const UNRESOLVED = "Não foi possível descrever a imagem.";

type ImageSource =
  | { type: "base64"; media_type: SupportedMediaType; data: string }
  | { type: "url"; url: string };

/**
 * Baixa a imagem NÓS MESMOS (server-side) e devolve base64. O Claude, recebendo só
 * a URL, não segue o redirect do active_storage do Chatwoot (ex.: story do Instagram)
 * e fica cego — mas a nossa rede baixa normalmente. Espelha o padrão da groq-audio.
 * Se o download falhar, retorna null e o caller cai pro source de URL (degradação).
 */
async function downloadImage(imageUrl: string): Promise<ImageSource | null> {
  try {
    const response = await fetch(imageUrl, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
    if (!response.ok) {
      logger.warn("Claude vision: download da imagem falhou", { status: response.status });
      return null;
    }
    const rawType = (response.headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase();
    const mediaType = SUPPORTED_MEDIA_TYPES.includes(rawType as SupportedMediaType)
      ? (rawType as SupportedMediaType)
      : "image/jpeg";
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength === 0 || buffer.byteLength > MAX_IMAGE_BYTES) {
      logger.warn("Claude vision: imagem vazia ou grande demais", { bytes: buffer.byteLength });
      return null;
    }
    return { type: "base64", media_type: mediaType, data: buffer.toString("base64") };
  } catch (error) {
    logger.warn("Claude vision: erro ao baixar imagem — caindo pra URL", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

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
  source: ImageSource,
  prompt: string,
): Promise<string> {
  const message = await client.messages.create({
    model,
    max_tokens: MAX_TOKENS,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source },
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

      // Baixa a imagem uma vez (server-side) e manda base64; se não der, usa a URL.
      const source: ImageSource = (await downloadImage(imageUrl)) ?? { type: "url", url: imageUrl };

      // Haiku primeiro (rápido/barato). Só escala pro Sonnet quando o Haiku falha
      // ou não resolve — decisão do dono: Sonnet apenas como fallback de visão.
      try {
        const text = await describeWith(client, config.model, source, finalPrompt);
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
          const text = await describeWith(client, config.fallbackModel, source, finalPrompt);
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
