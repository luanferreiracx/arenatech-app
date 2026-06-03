/**
 * Scheduler do Talison — debounce por conversa.
 *
 * O cliente costuma mandar várias mensagens seguidas ("balõezinhos"). Em vez
 * de responder cada uma, o webhook chama scheduleTalisonRun a cada mensagem;
 * agendamos o processamento pra DEBOUNCE_MS no futuro e gravamos uma
 * "generation" (nonce) no Redis. Quando o timer dispara, só processa se ainda
 * for a generation mais recente — senão descarta (chegou mensagem nova, que
 * reagendou). Resultado: uma resposta por rajada.
 *
 * O timer vive no processo Node (long-lived na VPS). Se o processo reiniciar
 * durante a janela, aquele disparo se perde — aceitável: o cliente reescreve,
 * ou a próxima mensagem reagenda. Sem worker novo, sem fila externa.
 *
 * Sem REDIS_URL, cai pra processamento imediato (single-instance/dev).
 */

import { getRedis } from "@/lib/redis";
import { logger } from "@/lib/logger";
import { processConversation } from "@/lib/talison/runner";

const DEBOUNCE_MS = Number(process.env.TALISON_DEBOUNCE_MS ?? 8_000);
const GENERATION_TTL_SECONDS = 60;

function generationKey(conversationId: string): string {
  return `talison:gen:${conversationId}`;
}

/** Nonce sem Math.random (indisponível em alguns contextos): timestamp+counter. */
let counter = 0;
function nextNonce(): string {
  counter = (counter + 1) % Number.MAX_SAFE_INTEGER;
  return `${Date.now()}-${counter}`;
}

async function runIfCurrent(
  tenantId: string,
  conversationId: string,
  nonce: string,
): Promise<void> {
  const redis = getRedis();
  if (redis) {
    const current = await redis.get(generationKey(conversationId));
    if (current !== nonce) {
      logger.debug("Talison: disparo obsoleto, descartando", { conversationId });
      return;
    }
  }
  try {
    const result = await processConversation(tenantId, conversationId);
    if (result.status === "skipped") {
      logger.info("Talison: conversa ignorada", { conversationId, reason: result.reason });
    }
  } catch (error) {
    logger.error("Talison: processamento falhou", {
      conversationId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Agenda (com debounce) o processamento de uma conversa pelo Talison.
 * Chamado pelo webhook a cada mensagem incoming do cliente. Não bloqueia.
 */
export async function scheduleTalisonRun(
  tenantId: string,
  conversationId: string,
): Promise<void> {
  const nonce = nextNonce();
  const redis = getRedis();

  if (redis) {
    await redis.set(generationKey(conversationId), nonce, "EX", GENERATION_TTL_SECONDS);
  }

  // unref() pra o timer não segurar o event loop no shutdown.
  setTimeout(() => {
    void runIfCurrent(tenantId, conversationId, nonce);
  }, DEBOUNCE_MS).unref();
}
