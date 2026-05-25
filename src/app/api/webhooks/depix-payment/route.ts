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
 *   2. DEPIX_WEBHOOK_IPS: allowlist CSV de IPs.
 *      ATENCAO: usa o ULTIMO IP de x-forwarded-for (o que entra no proxy).
 *      Para confiar nesse header, garanta que so o reverse proxy publico
 *      (nginx/cloudflare) chega ao container. Caso contrario, configure
 *      PIXPAY_WEBHOOK_SECRET (preferido).
 *   3. Em dev (sem secret nem ips), processa com warning.
 *
 * Idempotencia: usa coluna `external_id` de WhatsappMessageSent-like (ainda
 * nao temos tabela dedicada — controlado por "status != alvo" no UPDATE).
 *
 * HTTP codes:
 *   200 OK = webhook processado (idempotente ou nao). PixPay nao reenvia.
 *   400 = payload invalido / sem transactionId.
 *   401 = auth invalida.
 *   404 = transactionId desconhecido (sale/OS nao encontrada).
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
    // x-forwarded-for retorna lista "client, proxy1, proxy2". Para nao
    // confiar em IP forjado pelo cliente, pegamos o ULTIMO (que e o que
    // mais proximo do nosso server) — ele e gravado pelo nosso reverse
    // proxy publico (nginx/Cloudflare). NUNCA pegar o primeiro elemento
    // (cliente pode forjar).
    const xff = req.headers.get("x-forwarded-for") ?? "";
    const ips = xff
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const candidateIp = ips.length > 0 ? ips[ips.length - 1]! : (req.headers.get("x-real-ip") ?? "");
    if (!candidateIp || !allowedIps.includes(candidateIp)) {
      logger.warn("Depix-payment webhook: IP nao autorizado", {
        candidateIp,
        forwardedChainLength: ips.length,
      });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else {
    // Fail-closed em prod. Em dev/test, permite warning + proceder.
    if (process.env.NODE_ENV === "production") {
      logger.error(
        "Depix-payment webhook: rejeitando — sem PIXPAY_WEBHOOK_SECRET nem DEPIX_WEBHOOK_IPS em prod",
      );
      return NextResponse.json(
        { error: "Webhook auth nao configurado" },
        { status: 503 },
      );
    }
    logger.warn(
      "Depix-payment webhook: sem PIXPAY_WEBHOOK_SECRET nem DEPIX_WEBHOOK_IPS — processando sem auth (dev mode)",
    );
  }

  // ─── PARSE PAYLOAD ───────────────────────────────────────────────────────
  let payload: {
    qrId?: string;
    webhookType?: string;
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

  const transactionId = String(payload.qrId ?? payload.id ?? "");
  const rawStatus = String(payload.status ?? payload.webhookType ?? "").toLowerCase();
  const paidAt = payload.paid_at ? new Date(payload.paid_at) : new Date();

  // LGPD: mascarar CPF nos logs
  const maskedTax = payload.payerTaxNumber
    ? maskTaxNumber(payload.payerTaxNumber)
    : undefined;

  logger.info("Depix-payment webhook recebido", {
    transactionId,
    status: rawStatus,
    webhookType: payload.webhookType,
    payerTaxNumberMasked: maskedTax,
  });

  if (!transactionId) {
    return NextResponse.json({ error: "sem transactionId" }, { status: 400 });
  }

  const PAID_STATUSES = new Set([
    "completed",
    "confirmed",
    "paid",
    "depix_sent",
    "success",
  ]);
  const EXPIRED_STATUSES = new Set(["expired", "expirado"]);
  const FAILED_STATUSES = new Set(["failed", "cancelled", "canceled", "refunded"]);
  const isPaid = PAID_STATUSES.has(rawStatus);
  const isExpired = EXPIRED_STATUSES.has(rawStatus);
  const isFailed = FAILED_STATUSES.has(rawStatus);

  // Status nao final (pending, processing, etc) — apenas acknowledge.
  if (!isPaid && !isExpired && !isFailed) {
    return NextResponse.json({ received: true, ignored: true, status: rawStatus });
  }

  // Status de cancelamento/expiracao so atualiza QuickSale (Sale e ServiceOrder
  // tem fluxos manuais separados; webhook aqui marca apenas a venda avulsa).
  if (isExpired || isFailed) {
    const updated = await withAdmin(async (tx) => {
      return tx.quickSale.updateMany({
        where: {
          depixTransactionId: transactionId,
          status: "AWAITING_PAYMENT",
        },
        data: {
          status: isExpired ? "EXPIRED" : "CANCELLED",
          depixStatus: isExpired ? "expired" : "failed",
        },
      });
    });
    logger.info("Depix-payment webhook: QuickSale marcada como nao-paga", {
      transactionId,
      rawStatus,
      affected: updated.count,
    });
    return NextResponse.json({ received: true, finalized: true, count: updated.count });
  }

  // ─── IDEMPOTENCIA: insere evento na tabela de audit + early-exit se dup ─
  const signatureValid = !!secret;
  const sourceIpForAudit =
    (req.headers.get("x-forwarded-for") ?? "").split(",").map((s) => s.trim()).filter(Boolean).pop()
    ?? req.headers.get("x-real-ip")
    ?? null;
  const eventInserted = await withAdmin(async (tx) => {
    try {
      await tx.depixWebhookEvent.create({
        data: {
          transactionId,
          eventType: rawStatus,
          sourceIp: sourceIpForAudit,
          signatureValid,
          payload: payload as never,
          processed: false,
        },
      });
      return true;
    } catch {
      // Unique violation: (transactionId, eventType) ja existe — duplicate.
      return false;
    }
  });

  if (!eventInserted) {
    logger.info("Depix-payment webhook: evento duplicado, ignorando", {
      transactionId,
      eventType: rawStatus,
    });
    return NextResponse.json({ received: true, duplicate: true });
  }

  // ─── MATCH SALE OR OS (com idempotencia via WHERE status != alvo) ─────
  // Sanitizacao: transactionId vem do payload externo. Aceitar apenas
  // chars seguros (PixPay usa alfanumerico + hifen).
  if (!/^[a-zA-Z0-9_-]+$/.test(transactionId)) {
    return NextResponse.json({ error: "transactionId invalido" }, { status: 400 });
  }
  const result = await withAdmin(async (tx) => {
    // paymentDetails e um JSON array. Usamos jsonpath SQL para buscar
    // o transactionId em qualquer item do array (suporta split: parte
    // DePix + parte outra forma).
    const jsonpath = `$[*] ? (@.depixTransactionId == "${transactionId}")`;
    const matchingSales = await tx.$queryRaw<
      Array<{ id: string; tenantId: string; status: string; number: string; totalAmount: string }>
    >`
      SELECT id, tenant_id AS "tenantId", status, number, total_amount AS "totalAmount"
      FROM sales
      WHERE status != 'COMPLETED'
        AND payment_details @? ${jsonpath}::jsonpath
      LIMIT 1
    `;
    const sale = matchingSales[0];
    if (sale) {
      await tx.sale.update({
        where: { id: sale.id },
        data: {
          status: "COMPLETED",
          paidAmount: sale.totalAmount,
          saleDate: paidAt,
        },
      });
      return {
        kind: "sale",
        id: sale.id,
        number: sale.number,
        tenantId: sale.tenantId,
        amount: Number(sale.totalAmount),
      };
    }

    const order = await tx.serviceOrder.findFirst({
      where: { depixTransactionId: transactionId, status: { not: "PAID" } },
      select: {
        id: true,
        tenantId: true,
        status: true,
        number: true,
        totalAmount: true,
        createdById: true,
      },
    });
    if (order) {
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
      return {
        kind: "order",
        id: order.id,
        number: order.number,
        tenantId: order.tenantId,
        amount: Number(order.totalAmount),
      };
    }

    // Venda avulsa (QuickSale) — DePix isolado, sem PDV nem OS.
    const quickSale = await tx.quickSale.findFirst({
      where: {
        depixTransactionId: transactionId,
        status: "AWAITING_PAYMENT",
      },
      select: {
        id: true,
        tenantId: true,
        status: true,
        number: true,
        totalAmount: true,
      },
    });
    if (quickSale) {
      await tx.quickSale.update({
        where: { id: quickSale.id },
        data: {
          status: "PAID",
          paidAt,
          depixStatus: "paid",
        },
      });
      return {
        kind: "quick_sale",
        id: quickSale.id,
        number: quickSale.number,
        tenantId: quickSale.tenantId,
        amount: Number(quickSale.totalAmount),
      };
    }

    // Pode ser que sale/OS ja foi marcada (idempotencia OK). Antes de retornar
    // 404, confere se existe sale/OS com esse transactionId mas em status final.
    // Usa jsonpath pra cobrir paymentDetails como array (split payment).
    const existingSales = await tx.$queryRaw<
      Array<{ id: string; number: string; status: string }>
    >`
      SELECT id, number, status
      FROM sales
      WHERE payment_details @? ${jsonpath}::jsonpath
      LIMIT 1
    `;
    const existingSale = existingSales[0];
    if (existingSale) {
      return { kind: "sale_already_paid", id: existingSale.id, number: existingSale.number };
    }
    const existingOrder = await tx.serviceOrder.findFirst({
      where: { depixTransactionId: transactionId },
      select: { id: true, number: true, status: true },
    });
    if (existingOrder) {
      return { kind: "order_already_paid", id: existingOrder.id, number: existingOrder.number };
    }
    const existingQuickSale = await tx.quickSale.findFirst({
      where: { depixTransactionId: transactionId },
      select: { id: true, number: true, status: true },
    });
    if (existingQuickSale) {
      return {
        kind: "quick_sale_already_paid",
        id: existingQuickSale.id,
        number: existingQuickSale.number,
      };
    }

    return null;
  });

  if (!result) {
    // Marca evento como processado mas com erro
    await withAdmin(async (tx) =>
      tx.depixWebhookEvent.updateMany({
        where: { transactionId, eventType: rawStatus },
        data: { errorMessage: "transactionId nao encontrado" },
      }),
    ).catch(() => undefined);
    logger.warn("Depix-payment webhook: transactionId desconhecido", { transactionId });
    return NextResponse.json(
      { error: "transactionId nao encontrado" },
      { status: 404 },
    );
  }

  // Sucesso: marca evento como processado + registra uso de limite diario
  await withAdmin(async (tx) => {
    await tx.depixWebhookEvent.updateMany({
      where: { transactionId, eventType: rawStatus },
      data: {
        processed: true,
        finalStatus: result.kind.includes("already") ? "ALREADY_PAID" : "PAID",
      },
    });

    // Registra uso de limite por CPF (paridade Laravel DepixLimiteService::registrarUso)
    if (
      "tenantId" in result &&
      "amount" in result &&
      payload.payerTaxNumber &&
      !result.kind.includes("already")
    ) {
      const { registerDepixUse } = await import("@/lib/services/depix-limit-service");
      await registerDepixUse(
        tx,
        result.tenantId as string,
        payload.payerTaxNumber,
        result.amount as number,
      ).catch((err) =>
        logger.warn("Falha ao registrar uso de limite DePix", { err: String(err) }),
      );
    }
  });

  // Dispara NOTIFY pra rotas SSE escutando — frontend recebe confirmacao
  // em tempo real sem polling. Payload: JSON pequeno com kind + id + transactionId.
  // Apenas pra eventos que de fato marcaram PAID (nao "already").
  if (!result.kind.includes("already")) {
    await withAdmin(async (tx) => {
      const payload = JSON.stringify({
        kind: result.kind,
        id: result.id,
        transactionId,
      });
      // pg_notify aceita ate 8000 bytes; nosso payload < 200 bytes.
      await tx.$executeRaw`SELECT pg_notify('depix_paid', ${payload})`;
    }).catch((err) => {
      logger.warn("Falha ao emitir NOTIFY depix_paid", { err: String(err) });
    });
  }

  logger.info("Depix-payment webhook processado", {
    kind: result.kind,
    id: result.id,
    number: result.number,
  });
  return NextResponse.json({ received: true, kind: result.kind });
}

/**
 * Mascara CPF/CNPJ para logs (LGPD). Mantem so primeiros 3 e ultimos 2 digitos.
 * Ex: "12345678901" -> "123******01"; "12345678000190" -> "123*********90".
 */
function maskTaxNumber(doc: string): string {
  const d = doc.replace(/\D/g, "");
  if (d.length < 5) return "***";
  return `${d.slice(0, 3)}${"*".repeat(d.length - 5)}${d.slice(-2)}`;
}
