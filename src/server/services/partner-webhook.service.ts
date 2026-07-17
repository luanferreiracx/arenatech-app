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
import { assertPublicHttpsUrl, assertUrlResolvesToPublicIp } from "@/lib/security/ssrf";
import { sealSecret, openSecret } from "@/lib/security/secret-box";

/**
 * Domínio de cifragem do secret HMAC do webhook de saída. O secret é guardado
 * CIFRADO em repouso (AES-256-GCM) — um dump do banco não expõe os secrets de
 * webhook dos tenants (auditoria de segurança S6, 2026-07-08). Valores legados em
 * claro continuam sendo lidos até o backfill cifrá-los (openSecret é tolerante).
 */
const WEBHOOK_SECRET_CONTEXT = "partner-webhook";

export type PartnerWebhookEventType =
  // PIX recebido: o cliente PAGOU (pagamento confirmado). Dispara no marco pix-received
  // — sem esperar o DePix on-chain, que com o delay da Eulen pode levar ~24h. Use este
  // evento pra confirmar o pagamento; o `deposit.completed` = DePix liquidado on-chain.
  | "deposit.pix_received"
  | "deposit.completed"
  | "withdrawal.completed";

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
  // Primeira config com URL → gera secret automaticamente. Novo secret é gerado em
  // claro (a UI o exibe 1x) mas gravado CIFRADO. Secret existente é preservado como
  // está (já cifrado, ou legado em claro — o backfill/leitura tolera ambos).
  const newPlainSecret = existing?.secret ? null : args.url ? generateWebhookSecret() : null;
  const storedSecret = existing?.secret ?? (newPlainSecret ? sealSecret(newPlainSecret, WEBHOOK_SECRET_CONTEXT) : null);
  await withTenant(args.tenantId, async (tx) =>
    tx.partnerWebhookConfig.upsert({
      where: { tenantId: args.tenantId },
      create: { tenantId: args.tenantId, url: args.url, secret: storedSecret },
      update: { url: args.url, secret: storedSecret },
    }),
  );
  logger.info("partner-webhook: url atualizada", { tenantId: args.tenantId, hasUrl: !!args.url });
  // Retorna o secret em CLARO só quando acabou de ser criado (pra UI exibir 1x).
  return { secret: newPlainSecret };
}

/** Rotaciona o secret (retorna o novo em claro — exibido 1x; gravado cifrado). */
export async function rotatePartnerWebhookSecret(tenantId: string): Promise<{ secret: string }> {
  const plainSecret = generateWebhookSecret();
  const sealed = sealSecret(plainSecret, WEBHOOK_SECRET_CONTEXT);
  await withTenant(tenantId, async (tx) =>
    tx.partnerWebhookConfig.upsert({
      where: { tenantId },
      create: { tenantId, secret: sealed },
      update: { secret: sealed },
    }),
  );
  logger.info("partner-webhook: secret rotacionado", { tenantId });
  return { secret: plainSecret };
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

    // Anti-SSRF na ENTREGA: revalida formato e resolve o DNS antes do fetch (o host
    // pode ter sido cadastrado válido e depois apontar para um IP interno —
    // DNS-rebinding). `redirect: "error"` impede bypass via 3xx → host interno.
    const target = assertPublicHttpsUrl(cfg.url);
    await assertUrlResolvesToPublicIp(target);

    const body = JSON.stringify(event);
    // Secret cifrado em repouso — decifra antes de assinar. openSecret tolera
    // valores legados em claro (retorna como está) durante a transição.
    const secret = openSecret(cfg.secret, WEBHOOK_SECRET_CONTEXT);
    const signature = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");

    const res = await fetch(target, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-signature": signature,
        "x-event-type": event.type,
        "x-event-id": event.transactionId,
      },
      body,
      redirect: "error",
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
