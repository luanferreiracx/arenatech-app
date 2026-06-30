/**
 * Webhooks de SAÍDA da API de parceiros (ADR 0057, Fase 4). Notifica a URL do
 * tenant (1 por tenant) quando um depósito confirma ou um saque conclui.
 *
 * Assinatura: header `X-Signature: sha256=<hex>` = HMAC-SHA256(body, secret) — o
 * MESMO esquema dos webhooks que recebemos (LWK/Eulen). Entrega BEST-EFFORT (sem
 * fila): tenta uma vez com timeout curto; falhou → loga e segue (o parceiro pode
 * reconciliar via GET /transactions/:id). Nunca quebra o fluxo que disparou.
 */
import { randomBytes, createHmac } from "node:crypto";
import { withTenant } from "@/server/db";
import { logger } from "@/lib/logger";

export type PartnerWebhookEventType = "deposit.completed" | "withdrawal.completed";

export interface PartnerWebhookEvent {
  type: PartnerWebhookEventType;
  /** id da transação DePix correspondente. */
  transactionId: string;
  number: string;
  status: string;
  amountCents: number;
  /** ISO. */
  occurredAt: string;
}

/** Gera um secret HMAC novo (hex 32 bytes). */
export function generateWebhookSecret(): string {
  return randomBytes(32).toString("hex");
}

export interface PartnerWebhookConfigView {
  url: string | null;
  hasSecret: boolean;
  lastDeliveryAt: Date | null;
}

export async function getPartnerWebhookConfig(tenantId: string): Promise<PartnerWebhookConfigView> {
  const cfg = await withTenant(tenantId, async (tx) =>
    tx.partnerWebhookConfig.findUnique({
      where: { tenantId },
      select: { url: true, secret: true, lastDeliveryAt: true },
    }),
  );
  return {
    url: cfg?.url ?? null,
    hasSecret: !!cfg?.secret,
    lastDeliveryAt: cfg?.lastDeliveryAt ?? null,
  };
}

/** Define/atualiza a URL. Mantém o secret existente (ou cria um se ainda não há). */
export async function setPartnerWebhookUrl(args: {
  tenantId: string;
  url: string | null;
}): Promise<{ secret: string | null }> {
  const existing = await withTenant(args.tenantId, async (tx) =>
    tx.partnerWebhookConfig.findUnique({ where: { tenantId: args.tenantId }, select: { secret: true } }),
  );
  // Primeira config com URL → gera secret automaticamente.
  const secret = existing?.secret ?? (args.url ? generateWebhookSecret() : null);
  await withTenant(args.tenantId, async (tx) =>
    tx.partnerWebhookConfig.upsert({
      where: { tenantId: args.tenantId },
      create: { tenantId: args.tenantId, url: args.url, secret },
      update: { url: args.url, secret },
    }),
  );
  logger.info("partner-webhook: url atualizada", { tenantId: args.tenantId, hasUrl: !!args.url });
  // Retorna o secret só quando acabou de ser criado (pra UI exibir 1x).
  return { secret: existing?.secret ? null : secret };
}

/** Rotaciona o secret (retorna o novo — exibido 1x). */
export async function rotatePartnerWebhookSecret(tenantId: string): Promise<{ secret: string }> {
  const secret = generateWebhookSecret();
  await withTenant(tenantId, async (tx) =>
    tx.partnerWebhookConfig.upsert({
      where: { tenantId },
      create: { tenantId, secret },
      update: { secret },
    }),
  );
  logger.info("partner-webhook: secret rotacionado", { tenantId });
  return { secret };
}

/**
 * Envia o evento à URL do tenant (best-effort). No-op se não há URL/secret.
 * Fire-and-forget seguro: nunca lança (try/catch interno).
 */
export async function notifyPartnerWebhook(
  tenantId: string,
  event: PartnerWebhookEvent,
): Promise<void> {
  try {
    const cfg = await withTenant(tenantId, async (tx) =>
      tx.partnerWebhookConfig.findUnique({
        where: { tenantId },
        select: { url: true, secret: true },
      }),
    );
    if (!cfg?.url || !cfg.secret) return;

    const body = JSON.stringify(event);
    const signature = "sha256=" + createHmac("sha256", cfg.secret).update(body).digest("hex");

    const res = await fetch(cfg.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-signature": signature,
        "x-event-type": event.type,
        "x-event-id": event.transactionId,
      },
      body,
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) {
      logger.warn("partner-webhook: entrega não-2xx", {
        tenantId,
        type: event.type,
        status: res.status,
      });
      return;
    }
    await withTenant(tenantId, async (tx) =>
      tx.partnerWebhookConfig.update({ where: { tenantId }, data: { lastDeliveryAt: new Date() } }),
    ).catch(() => {});
    logger.info("partner-webhook: entregue", { tenantId, type: event.type, txId: event.transactionId });
  } catch (err) {
    logger.warn("partner-webhook: falha na entrega (best-effort)", {
      tenantId,
      type: event.type,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}
