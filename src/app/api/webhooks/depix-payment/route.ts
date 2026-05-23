import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { withAdmin } from "@/server/db";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

/**
 * POST /api/webhooks/depix-payment
 *
 * Webhook PixPay/Depix — recebe confirmacoes de pagamento PIX.
 * Quando pagamento confirma (`status=depix_sent`/`paid`/`completed`), a venda
 * ou OS associada ao `transactionId` eh marcada como paga automaticamente.
 *
 * Payload PixPay (atual):
 *   { qrId, status, webhookType, payerName, payerTaxNumber, valueInCents, ... }
 * Payload legado/generico:
 *   { id, status, paid_amount, paid_at }
 *
 * Seguranca (em ordem de preferencia):
 *   1. PIXPAY_WEBHOOK_SECRET: HMAC-SHA256 do body em header `X-Webhook-Signature`.
 *   2. DEPIX_WEBHOOK_IPS: allowlist CSV de IPs (paridade Laravel).
 *   3. Se nenhum dos dois configurado, processa sem auth (DEV ONLY, loga warn).
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  // ─── AUTH ────────────────────────────────────────────────────────────────
  const secret = process.env.PIXPAY_WEBHOOK_SECRET;
  const allowedIps = (process.env.DEPIX_WEBHOOK_IPS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (secret) {
    const signature = req.headers.get("x-webhook-signature") ?? "";
    const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
    const valid =
      signature.length === expected.length &&
      signature.length > 0 &&
      timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    if (!valid) {
      logger.warn("Depix-payment webhook: HMAC invalido");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else if (allowedIps.length > 0) {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      "";
    if (!allowedIps.includes(ip)) {
      logger.warn("Depix-payment webhook: IP nao autorizado", { ip });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else {
    logger.warn(
      "Depix-payment webhook: sem PIXPAY_WEBHOOK_SECRET nem DEPIX_WEBHOOK_IPS — processando sem auth",
    );
  }

  // ─── PARSE PAYLOAD ───────────────────────────────────────────────────────
  let payload: {
    // PixPay novo
    qrId?: string;
    webhookType?: string;
    // Generico/legado
    id?: string;
    status?: string;
    paid_amount?: number;
    paid_at?: string;
    valueInCents?: number;
    payerName?: string;
    payerTaxNumber?: string;
  };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  // qrId (novo) ou id (legado) — ambos identificam a transacao.
  const transactionId = String(payload.qrId ?? payload.id ?? "");
  const rawStatus = String(payload.status ?? payload.webhookType ?? "").toLowerCase();
  const paidAt = payload.paid_at ? new Date(payload.paid_at) : new Date();

  logger.info("Depix-payment webhook recebido", {
    transactionId,
    status: rawStatus,
    webhookType: payload.webhookType,
  });

  if (!transactionId) {
    return NextResponse.json({ received: true, error: "sem transaction id" });
  }

  // Status que disparam o pagamento. PixPay envia "depix_sent" quando confirma.
  const PAID_STATUSES = new Set([
    "completed",
    "confirmed",
    "paid",
    "depix_sent",
    "success",
  ]);
  if (!PAID_STATUSES.has(rawStatus)) {
    return NextResponse.json({ received: true, ignored: true, status: rawStatus });
  }

  // ─── MATCH SALE OR OS ────────────────────────────────────────────────────
  const result = await withAdmin(async (tx) => {
    const sale = await tx.sale.findFirst({
      where: { paymentDetails: { path: ["depixTransactionId"], equals: transactionId } as never },
      select: { id: true, tenantId: true, status: true, number: true, totalAmount: true },
    });
    if (sale && sale.status !== "COMPLETED") {
      await tx.sale.update({
        where: { id: sale.id },
        data: {
          status: "COMPLETED",
          paidAmount: sale.totalAmount,
          saleDate: paidAt,
        },
      });
      return { kind: "sale", id: sale.id, number: sale.number };
    }

    const order = await tx.serviceOrder.findFirst({
      where: { depixTransactionId: transactionId },
      select: {
        id: true,
        tenantId: true,
        status: true,
        number: true,
        totalAmount: true,
        createdById: true,
      },
    });
    if (order && order.status !== "PAID") {
      await tx.serviceOrder.update({
        where: { id: order.id },
        data: {
          status: "PAID",
          paidAmount: order.totalAmount,
          paymentMethod: "pix_depix",
          paymentDate: paidAt,
          depixStatus: "confirmed",
        },
      });
      await tx.serviceOrderHistory.create({
        data: {
          tenantId: order.tenantId,
          orderId: order.id,
          userId: order.createdById,
          previousStatus: order.status,
          newStatus: "PAID",
          notes: `Pagamento Pix Depix confirmado (transaction ${transactionId})`,
        },
      });
      return { kind: "order", id: order.id, number: order.number };
    }

    return null;
  });

  if (!result) {
    logger.warn("Depix-payment webhook sem alvo encontrado", { transactionId });
    return NextResponse.json({ received: true, found: false });
  }

  logger.info("Depix-payment webhook processado", {
    kind: result.kind,
    id: result.id,
    number: result.number,
  });
  return NextResponse.json({ received: true, kind: result.kind });
}
