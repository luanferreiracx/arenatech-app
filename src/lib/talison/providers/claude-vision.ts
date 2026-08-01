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
// 512 cortava a descrição no meio quando o anúncio tinha muito texto — e o que
// se perdia no fim era justamente preço e condição de venda.
const MAX_TOKENS = 800;
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
/** Único ponto onde um MIME solto vira um dos tipos que o Claude aceita. */
function toSupportedMediaType(raw: string | null | undefined): SupportedMediaType {
  const normalized = (raw ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  return SUPPORTED_MEDIA_TYPES.includes(normalized as SupportedMediaType)
    ? (normalized as SupportedMediaType)
    : "image/jpeg";
}

async function downloadImage(imageUrl: string): Promise<ImageSource | null> {
  try {
    const response = await fetch(imageUrl, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
    if (!response.ok) {
      logger.warn("Claude vision: download da imagem falhou", { status: response.status });
      return null;
    }
    const mediaType = toSupportedMediaType(response.headers.get("content-type"));
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

/**
 * Um prompt só, porque a foto do cliente é ambígua por natureza: pode ser o
 * anúncio da loja, o aparelho pra avaliação, um defeito ou um comprovante de
 * pagamento — e classificar antes de olhar erra.
 *
 * O prompt anterior pedia só "estado físico do aparelho (tela, carcaça, danos)".
 * Em anúncio isso devolvia "a caixa está fechada, não dá pra avaliar o estado" e
 * o bot perdia o produto; em comprovante, "não mostra nenhum aparelho físico".
 * Medido em 01/08/2026: story em imagem escalava 86,2% pro humano contra 86,7%
 * de story em vídeo — ou seja, enxergar não estava ajudando em nada.
 */
const DEFAULT_PROMPT =
  "Você ajuda o atendimento de uma loja de eletrônicos a entender uma imagem " +
  "enviada por um cliente. Ela pode ser um anúncio/story da loja, o aparelho do " +
  "cliente para avaliação ou troca, um defeito, ou um comprovante de pagamento. " +
  "Responda em português, em tópicos curtos:\n" +
  "PRODUTO: modelo exato, capacidade e cor, se der pra identificar.\n" +
  "CONDIÇÃO DE VENDA: se a imagem disser novo, seminovo, usado, lacrado ou de vitrine, " +
  "escreva qual — palavra por palavra. Não deduza pelo estado aparente; se não estiver escrito, 'não informado'.\n" +
  "TEXTOS: transcreva TODOS os preços e condições de pagamento exatamente como aparecem, " +
  "e qualquer outro texto visível.\n" +
  "ESTADO: condição física aparente (tela, carcaça, danos), se houver aparelho.\n" +
  "DEFEITO: o problema aparente, se houver.\n" +
  "Escreva 'não informado' no que não estiver visível. Nunca invente.";

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
    async describe({ image, prompt }) {
      const config = getConfig();
      if (!config) {
        logger.info("Claude vision: mock mode (sem ANTHROPIC_API_KEY)");
        return "[mock] imagem recebida (visão desativada em dev).";
      }

      const client = new Anthropic({ apiKey: config.apiKey, timeout: REQUEST_TIMEOUT_MS });
      const finalPrompt = prompt ?? DEFAULT_PROMPT;

      // Bytes em mãos (quadro de vídeo) vão direto. URL a gente baixa uma vez
      // server-side e manda base64; se o download falhar, cai pra URL crua.
      const source: ImageSource =
        "base64" in image
          ? { type: "base64", media_type: toSupportedMediaType(image.mediaType), data: image.base64 }
          : ((await downloadImage(image.url)) ?? { type: "url", url: image.url });

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
