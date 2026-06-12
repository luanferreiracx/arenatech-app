/**
 * Classificador de intenção do Talison (barato/rápido via Groq).
 *
 * O fluxo de espera (alerta de abandono + mensagem "aguarde") só deve agir
 * quando o cliente está REALMENTE aguardando uma resposta — não quando ele só
 * encerrou ("ok", "obrigado", "tô a caminho"). Uma lista de palavras seria
 * frágil; aqui um modelo pequeno julga a intenção a partir do fim da conversa.
 *
 * Sem GROQ_API_KEY (dev/CI) ou em erro: retorna false (conservador — não
 * incomoda o cliente).
 */

import OpenAI from "openai";
import { logger } from "@/lib/logger";

const DEFAULT_MODEL = "openai/gpt-oss-20b";
const DEFAULT_BASE_URL = "https://api.groq.com/openai/v1";
const REQUEST_TIMEOUT_MS = 15_000;

const SYSTEM_PROMPT =
  "Você analisa o fim de uma conversa de WhatsApp de uma loja de tecnologia. " +
  "Decida se o CLIENTE está AGUARDANDO uma resposta ou ação da loja, ou se " +
  "apenas ENCERROU a conversa (agradeceu, confirmou, disse ok/tchau/beleza, " +
  "ou avisou que vai/está indo à loja). Na dúvida, prefira AGUARDANDO. " +
  "Cutucadas como 'oi?', 'olá?', 'tem retorno?', 'alguém aí?', 'cadê?' significam " +
  "AGUARDANDO. Responda SOMENTE com uma palavra: AGUARDANDO ou ENCERROU.";

/**
 * Heurística determinística: a última mensagem do cliente é claramente uma
 * cutucada/pergunta de quem está ESPERANDO resposta? Cobre os casos óbvios que
 * o modelo pequeno às vezes erra (ex.: classificar "ola?" como encerrado).
 */
export function looksLikeWaitingNudge(text: string | null | undefined): boolean {
  const t = (text ?? "").trim().toLowerCase();
  if (!t) return false;
  if (t.endsWith("?")) return true;
  return /^(oi+|ol[áa]+|opa|e a[íi]|al[ôo]|alguem|algu[ée]m|cad[êe]|ainda|demora|tem (algum )?(retorno|novidade|previs[ãa]o))/.test(
    t,
  );
}

/**
 * O cliente está aguardando uma resposta/ação da loja?
 * `transcript` deve trazer as últimas mensagens (cliente por último).
 */
export async function isCustomerWaitingReply(transcript: string): Promise<boolean> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey || !transcript.trim()) return false;

  try {
    const client = new OpenAI({
      apiKey,
      baseURL: process.env.GROQ_BASE_URL ?? DEFAULT_BASE_URL,
      timeout: REQUEST_TIMEOUT_MS,
    });
    const response = await client.chat.completions.create({
      model: process.env.GROQ_INTENT_MODEL ?? DEFAULT_MODEL,
      max_tokens: 4,
      temperature: 0,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: transcript },
      ],
    });
    const out = (response.choices[0]?.message?.content ?? "").toUpperCase();
    return out.includes("AGUARDANDO");
  } catch (error) {
    logger.warn("Talison: classificação de intenção falhou — tratando como encerrado", {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}
