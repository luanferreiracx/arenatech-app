/**
 * Groq Whisper — provider de transcrição de áudio do Talison.
 *
 * O DeepSeek não ouve áudio e a API do Claude não aceita áudio. Muitos clientes
 * mandam áudio no WhatsApp; aqui baixamos o ogg/opus (data_url do Chatwoot) e
 * transcrevemos no Whisper da Groq (OpenAI-compatible, rápido e barato). A
 * transcrição entra no histórico como texto do cliente, e o DeepSeek responde.
 *
 * Sem GROQ_API_KEY, opera em mock mode (dev/CI).
 */

import OpenAI, { toFile } from "openai";
import { logger } from "@/lib/logger";
import type { AudioProvider } from "@/lib/talison/types";

const DEFAULT_MODEL = "whisper-large-v3-turbo";
const DEFAULT_BASE_URL = "https://api.groq.com/openai/v1";
const DOWNLOAD_TIMEOUT_MS = 20_000;
const TRANSCRIBE_TIMEOUT_MS = 45_000;

type GroqConfig = { apiKey: string; baseURL: string; model: string };

function getConfig(): GroqConfig | null {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;
  return {
    apiKey,
    baseURL: process.env.GROQ_BASE_URL ?? DEFAULT_BASE_URL,
    model: process.env.GROQ_WHISPER_MODEL ?? DEFAULT_MODEL,
  };
}

/** Nome de arquivo com extensão — o Whisper infere o formato pela extensão. */
function fileNameFromUrl(audioUrl: string): string {
  try {
    const path = new URL(audioUrl).pathname;
    const base = path.split("/").pop();
    if (base && /\.[a-z0-9]{2,4}$/i.test(base)) return base;
  } catch {
    // URL inválida → cai no default abaixo
  }
  return "audio.ogg";
}

export function createGroqAudioProvider(): AudioProvider {
  return {
    name: "groq-whisper",
    async transcribe({ audioUrl }) {
      const config = getConfig();
      if (!config) {
        logger.info("Groq áudio: mock mode (sem GROQ_API_KEY)");
        return "[mock] áudio recebido (transcrição desativada em dev).";
      }

      // 1) Baixa o áudio (Chatwoot entrega data_url acessível).
      const audioResponse = await fetch(audioUrl, {
        signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
      });
      if (!audioResponse.ok) {
        throw new Error(`download áudio HTTP ${audioResponse.status}`);
      }
      const audioBuffer = Buffer.from(await audioResponse.arrayBuffer());

      // 2) Transcreve na Groq (Whisper).
      const client = new OpenAI({
        apiKey: config.apiKey,
        baseURL: config.baseURL,
        timeout: TRANSCRIBE_TIMEOUT_MS,
      });
      const file = await toFile(audioBuffer, fileNameFromUrl(audioUrl));
      const transcription = await client.audio.transcriptions.create({
        file,
        model: config.model,
        language: "pt",
      });

      return transcription.text.trim();
    },
  };
}
