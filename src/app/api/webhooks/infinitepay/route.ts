import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { withAdmin, withTenant } from "@/server/db";
import { logger } from "@/lib/logger";
import {
  checkInfinitepayPayment,
  infinitepayWebhookSchema,
} from "@/lib/services/infinitepay-service";
import { getInfinitepayConfig } from "@/lib/services/infinitepay-config";

export const runtime = "nodejs";

/**
 * POST /api/webhooks/infinitepay
 *
 * Webhook de pagamento aprovado da InfinitePay. Usamos `order_nsu` = id da
 * venda, entao achamos a venda direto pela PK.
 *
 * SEGURANCA: a InfinitePay NAO assina o webhook (sem HMAC/secret na doc). Por
 * isso NUNCA confiamos no payload cru — revalidamos cada pagamento via
 * `POST /payment_check` (fonte de verdade da liquidacao) antes de marcar pago.
 * Um webhook forjado com slug/transaction_nsu falsos reprova no payment_check.
 *
 * Ao confirmar: marca o leg `infinitepay` da venda como pago em paymentDetails
 * e dispara pg_notify('depix_paid') (canal compartilhado de "venda paga") para
 * o SSE -> o PDV auto-finaliza. Mesmo canal SSE do webhook da Eulen.
 *
 * HTTP codes:
 *   200 = processado / idempotente / nada a fazer (InfinitePay nao reenvia).
 *   400 = payload invalido ou pagamento nao confirmado (InfinitePay reenvia).
 */
export async function POST(req: NextRequest) {
  const startedAt = Date.now();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const parsed = infinitepayWebhookSchema.safeParse(body);
  if (!parsed.success) {
    logger.warn("InfinitePay webhook: payload invalido", { issues: parsed.error.issues });
    return NextResponse.json({ error: "payload invalido" }, { status: 400 });
  }
  const payload = parsed.data;
  const saleId = payload.order_nsu;

  // order_nsu = id da venda. Busca cross-tenant (webhook nao tem sessao).
  const sale = await withAdmin(async (tx) =>
    tx.sale.findUnique({
      where: { id: saleId },
      select: { id: true, tenantId: true, status: true },
    }),
  ).catch(() => null);

  if (!sale) {
    // Order desconhecida — ack 200 para nao gerar retry infinito.
    logger.warn("InfinitePay webhook: venda nao encontrada", { orderNsu: saleId });
    return NextResponse.json({ received: true, note: "order desconhecida" });
  }

  // Venda ja finalizada/cancelada: o pagamento ja foi (ou nao sera) contabilizado.
  if (sale.status !== "DRAFT") {
    logger.info("InfinitePay webhook: venda nao esta em rascunho", {
      saleId,
      status: sale.status,
    });
    return NextResponse.json({ received: true, status: sale.status });
  }

  const config = await withTenant(sale.tenantId, (tx) => getInfinitepayConfig(tx, sale.tenantId));
  if (!config) {
    logger.error("InfinitePay webhook: tenant sem config/handle", { saleId, tenantId: sale.tenantId });
    return NextResponse.json({ received: true, note: "integracao desabilitada" });
  }

  // Idempotencia: se o leg ja esta pago, nada a refazer.
  const alreadyPaid = await withTenant(sale.tenantId, async (tx) => {
    const s = await tx.sale.findUnique({ where: { id: saleId }, select: { paymentDetails: true } });
    const pd = Array.isArray(s?.paymentDetails) ? (s!.paymentDetails as Array<Record<string, unknown>>) : [];
    return pd.some((p) => p?.method === "infinitepay" && p?.infinitepayStatus === "paid");
  });
  if (alreadyPaid) {
    return NextResponse.json({ received: true, note: "ja processado" });
  }

  // REVALIDA via payment_check — fonte de verdade (webhook nao e assinado).
  let check;
  try {
    check = await checkInfinitepayPayment({
      handle: config.handle,
      orderNsu: saleId,
      transactionNsu: payload.transaction_nsu,
      slug: payload.invoice_slug,
    });
  } catch (err) {
    logger.error("InfinitePay webhook: payment_check falhou", { saleId, err: String(err) });
    // Erro transitorio — pede retry.
    return NextResponse.json({ error: "falha ao validar pagamento" }, { status: 400 });
  }

  if (!check.success || !check.paid) {
    logger.warn("InfinitePay webhook: pagamento nao confirmado no payment_check", {
      saleId,
      success: check.success,
      paid: check.paid,
    });
    return NextResponse.json({ error: "pagamento nao confirmado" }, { status: 400 });
  }

  // Confirmado: marca o leg pago + NOTIFY na MESMA tx (pg_notify dispara no
  // COMMIT, entao o SSE so recebe quando o UPDATE ja esta visivel).
  await withTenant(sale.tenantId, async (tx) => {
    const current = (await tx.sale.findUnique({
      where: { id: saleId },
      select: { paymentDetails: true },
    }))?.paymentDetails;
    const arr = Array.isArray(current) ? (current as Array<Record<string, unknown>>) : [];
    const idx = arr.findIndex((p) => p?.method === "infinitepay");
    const paidLeg: Record<string, unknown> = {
      method: "infinitepay",
      // Mantem o valor do leg pendente; se sumiu (operador fechou o QR mas o
      // cliente pagou), usa o valor verificado pra nao perder o pagamento.
      amount: idx >= 0 ? arr[idx]!.amount : check.amountCents,
      infinitepayOrderNsu: saleId,
      infinitepayStatus: "paid",
      infinitepaySlug: payload.invoice_slug,
      infinitepayTransactionNsu: payload.transaction_nsu,
      infinitepayCaptureMethod: check.captureMethod,
      infinitepayPaidAmount: check.paidAmountCents,
      installments: check.installments,
      ...(idx >= 0 && arr[idx]!.infinitepayUrl ? { infinitepayUrl: arr[idx]!.infinitepayUrl } : {}),
    };
    if (idx >= 0) arr[idx] = paidLeg;
    else arr.push(paidLeg);
    await tx.sale.update({
      where: { id: saleId },
      data: { paymentDetails: arr as unknown as Prisma.InputJsonValue },
    });

    const notifyPayload = JSON.stringify({
      kind: "sale",
      id: saleId,
      transactionId: payload.transaction_nsu,
    });
    await tx.$executeRaw`SELECT pg_notify('depix_paid', ${notifyPayload})`;
  });

  logger.info("InfinitePay webhook processado", {
    saleId,
    captureMethod: check.captureMethod,
    duration_ms: Date.now() - startedAt,
  });
  return NextResponse.json({ received: true });
}
