import { withAdmin } from "@/server/db";
import { logger } from "@/lib/logger";

/**
 * Replay protection generico para webhooks.
 *
 * Tenta inserir um registro em `webhook_events` com a chave unica
 * (provider, eventId). Se o INSERT falhar com unique violation,
 * significa que o mesmo evento ja foi processado (replay) — o caller
 * deve retornar 200 OK idempotente sem reprocessar.
 *
 * Retorna `true` se eh um evento novo (deve ser processado).
 * Retorna `false` se eh duplicate (replay).
 */
export async function recordWebhookEvent(params: {
  provider: string;
  eventId: string;
  eventType?: string | null;
  sourceIp?: string | null;
  signatureValid?: boolean;
  payload: unknown;
}): Promise<boolean> {
  try {
    await withAdmin(async (tx) => {
      await tx.webhookEvent.create({
        data: {
          provider: params.provider,
          eventId: params.eventId,
          eventType: params.eventType ?? null,
          sourceIp: params.sourceIp ?? null,
          signatureValid: params.signatureValid ?? false,
          payload: params.payload as never,
          processed: false,
        },
      });
    });
    return true;
  } catch {
    // Unique violation (provider, event_id) = replay. Tratamos o erro
    // como sinal de duplicidade — outros erros (e.g. DB down) tambem
    // caem aqui mas ai o caller falha de qualquer jeito ao fazer suas
    // proprias queries; perda eh aceitavel.
    return false;
  }
}

/** Marca um evento como processado com sucesso (ou erro). */
export async function markWebhookProcessed(
  provider: string,
  eventId: string,
  result: { ok: boolean; errorMessage?: string },
): Promise<void> {
  try {
    await withAdmin(async (tx) => {
      await tx.webhookEvent.updateMany({
        where: { provider, eventId },
        data: {
          processed: result.ok,
          errorMessage: result.errorMessage ?? null,
        },
      });
    });
  } catch (err) {
    logger.warn("markWebhookProcessed falhou", {
      provider,
      eventId,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

/** Extrai o ultimo IP da chain x-forwarded-for (mais proximo do server). */
export function extractSourceIp(headers: Headers): string | null {
  const xff = headers.get("x-forwarded-for") ?? "";
  const ips = xff
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (ips.length > 0) return ips[ips.length - 1]!;
  return headers.get("x-real-ip");
}
