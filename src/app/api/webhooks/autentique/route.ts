import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { withAdmin } from "@/server/db";
import { logger } from "@/lib/logger";
import {
  recordWebhookEvent,
  markWebhookProcessed,
  extractSourceIp,
} from "@/lib/webhooks/replay-guard";

export const runtime = "nodejs";

/**
 * POST /api/webhooks/autentique
 *
 * Recebe eventos da Autentique (signature.accepted, signature.rejected, etc).
 * Quando o documento e assinado, marca a OS correspondente como assinada.
 *
 * Autenticacao: header `X-Autentique-Signature` = HMAC-SHA256(body, secret).
 * O secret e configurado no painel Autentique e replicado em AUTENTIQUE_WEBHOOK_SECRET.
 *
 * Doc: https://docs.autentique.com.br/api/integration-basics/webhooks.md
 */
export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get("x-autentique-signature");

  // Valida HMAC se segredo configurado. Em prod, segredo e obrigatorio.
  const secret = process.env.AUTENTIQUE_WEBHOOK_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      logger.error(
        "Autentique webhook: AUTENTIQUE_WEBHOOK_SECRET ausente em prod — rejeitando.",
      );
      return NextResponse.json({ error: "Service not configured" }, { status: 503 });
    }
    logger.warn("Autentique webhook: sem AUTENTIQUE_WEBHOOK_SECRET — aceitando em dev");
  } else {
    if (!signature) {
      logger.warn("Autentique webhook sem X-Autentique-Signature");
      return NextResponse.json({ error: "missing signature" }, { status: 401 });
    }
    const expected = crypto.createHmac("sha256", secret).update(body).digest("hex");
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      logger.warn("Autentique webhook HMAC invalido");
      return NextResponse.json({ error: "invalid signature" }, { status: 401 });
    }
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(body) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const event = payload.event as Record<string, unknown> | undefined;
  const eventType = String(event?.type ?? "");
  const data = (event?.data ?? {}) as Record<string, unknown>;
  const documentId = String(data.document ?? "");

  logger.info("Autentique webhook recebido", { eventType, documentId });

  // So agimos sobre signature.accepted (cliente concluiu assinatura).
  // Outros eventos (viewed, rejected, biometric_*) sao logados mas ignorados.
  if (eventType !== "signature.accepted") {
    return NextResponse.json({ received: true });
  }

  if (!documentId) {
    logger.warn("Autentique webhook signature.accepted sem document id", { payload });
    return NextResponse.json({ received: true });
  }

  // Replay protection: (documentId, eventType) identifica o evento unicamente.
  const eventKey = `${documentId}:${eventType}`;
  const isNewEvent = await recordWebhookEvent({
    provider: "autentique",
    eventId: eventKey,
    eventType,
    sourceIp: extractSourceIp(req.headers),
    signatureValid: !!secret,
    payload,
  });
  if (!isNewEvent) {
    logger.info("Autentique webhook: evento duplicado", { eventKey });
    return NextResponse.json({ received: true, duplicate: true });
  }

  const signedAtStr = data.signed ? String(data.signed) : null;
  const signedAt = signedAtStr ? new Date(signedAtStr) : new Date();

  // Localiza a OS pelo documentId (busca cross-tenant via admin).
  // A coluna signatureDocumentId nao tem index unico mas o id Autentique e
  // global — entao findFirst funciona bem.
  const order = await withAdmin(async (tx) =>
    tx.serviceOrder.findFirst({
      where: { signatureDocumentId: documentId },
      select: {
        id: true, tenantId: true, customerId: true, number: true,
        status: true, signatureSignedAt: true, createdById: true,
      },
    }),
  );

  if (!order) {
    logger.warn("Autentique webhook: OS nao encontrada para documentId", { documentId });
    return NextResponse.json({ received: true });
  }

  if (order.signatureSignedAt) {
    logger.info("OS ja marcada como assinada — webhook idempotente", { orderId: order.id });
    return NextResponse.json({ received: true });
  }

  await withAdmin(async (tx) => {
    await tx.serviceOrder.update({
      where: { id: order.id },
      data: { signatureSignedAt: signedAt },
    });
    await tx.serviceOrderHistory.create({
      data: {
        tenantId: order.tenantId,
        orderId: order.id,
        // Autor: criador da OS (webhook nao tem userId proprio).
        userId: order.createdById,
        previousStatus: order.status,
        newStatus: order.status,
        notes: "Documento assinado digitalmente (Autentique)",
      },
    });
  });

  await markWebhookProcessed("autentique", eventKey, { ok: true });

  logger.info("OS marcada como assinada via webhook Autentique", {
    orderId: order.id,
    documentId,
    signedAt: signedAt.toISOString(),
  });

  return NextResponse.json({ received: true });
}
