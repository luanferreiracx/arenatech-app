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

/** Tira emojis, pontuação solta e espaços do FIM — pra não cegar o endsWith("?"). */
function trimTrailingNoise(text: string): string {
  return text.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}\s]+$/u, "").trimEnd();
}

/**
 * Heurística determinística: a última mensagem do cliente é claramente uma
 * cutucada/pergunta de quem está ESPERANDO resposta? Cobre os casos óbvios que
 * o modelo pequeno às vezes erra (ex.: classificar "ola?" como encerrado).
 *
 * Pega três sinais fortes: (1) pergunta — termina com "?" mesmo que haja emoji
 * depois ("pode fazer? 😿"); (2) urgência explícita ("urgente", "preciso",
 * "rápido", "liguei agora"); (3) cutucada de abertura ("oi?", "alguém?", "cadê").
 */
export function looksLikeWaitingNudge(text: string | null | undefined): boolean {
  const t = trimTrailingNoise((text ?? "").trim().toLowerCase());
  if (!t) return false;
  if (t.endsWith("?")) return true;
  // Urgência / cobrança em qualquer ponto da frase.
  if (
    /(urg[êe]nc|urgente|me\s+respond|sem\s+resposta|aguardando|(acabei de |j[áa] )?(liguei|ligando|tentei ligar|acabei de ligar))/u.test(
      t,
    )
  ) {
    return true;
  }
  // Cutucada de abertura no início da frase.
  return /^(oi+|ol[áa]+|opa|e a[íi]|al[ôo]|alguem|algu[ée]m|cad[êe]|ainda|demora|preciso|tem (algum )?(retorno|novidade|previs[ãa]o))/.test(
    t,
  );
}

/**
 * A última mensagem do cliente é um encerramento/adiamento ÓBVIO (agradeceu,
 * ok, vai pensar, tô a caminho)? Usado pra NÃO alertar/incomodar quem encerrou.
 * Conservador: só pega casos claros — "sim"/"certo" NÃO contam (podem ser um
 * "sim, me transfere" de quem segue aguardando).
 */
export function isObviousCloser(text: string | null | undefined): boolean {
  const raw = (text ?? "").trim().toLowerCase();
  // Só emojis/agradecimento/curto de fechamento.
  if (/^[\p{Emoji_Presentation}\p{Extended_Pictographic}\s]+$/u.test(raw) && raw !== "") return true;
  // Tira emoji + pontuação do fim ("obrigada 🙏", "valeu!") antes de casar.
  const t = trimTrailingNoise(raw).replace(/[!.…\s]+$/u, "");
  if (!t) return false;
  return /^(ok|okay|okww|blz|beleza|valeu|vlw|obrigad[oa]+|brigad[oa]+|agradec|tchau|at[ée]( mais| logo| breve)?|falou|tmj|tranquilo|de nada|por nada|imagina|vou pensar|vou ver|vou analisar|depois( eu)? (vejo|volto|retorno|falo)|mais tarde|j[áa] (volto|retorno)|vou conversar|(t[ôo]|estou|j[áa] (t[ôo]|estou)) (indo|a caminho)|a caminho|vou a[íi]|vou na loja|vou at[ée])/.test(
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
