import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { logger } from "@/lib/logger";
import { sendTextWithFallback } from "@/lib/whatsapp/send-with-fallback";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/cron/notify-warranty-expiring
 *
 * Cron diario que avisa o cliente quando a garantia da OS vai vencer em
 * EXATAMENTE 7 dias. Verifica `completedDate + warrantyMonths` cair na
 * janela [hoje, hoje+7]; usa controle de idempotencia para nao reenviar
 * o mesmo aviso 2x.
 *
 * Antifraude:
 *   - exige header Authorization: Bearer ${CRON_SECRET}.
 *
 * Critérios:
 *   - status = DELIVERED ou PAID (cliente recebeu o aparelho)
 *   - completedDate IS NOT NULL
 *   - warrantyMonths > 0
 *   - warrantyExpiresAt = completedDate + warrantyMonths meses
 *   - hoje <= warrantyExpiresAt <= hoje + 7 dias
 *   - warrantyExpiryNotifiedAt IS NULL (nao enviou ainda)
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const expectedSecret = process.env.CRON_SECRET;

  if (!expectedSecret) {
    logger.error("[cron-warranty-expiring] CRON_SECRET not configured");
    return NextResponse.json({ error: "Cron secret not configured" }, { status: 500 });
  }
  if (authHeader !== `Bearer ${expectedSecret}`) {
    logger.warn("[cron-warranty-expiring] Unauthorized cron attempt");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();
    const horizon = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    // SQL filtrando OS com garantia vencendo em <=7d (sem ler tudo em memoria).
    // INTERVAL '<n> months' calcula a data de expiracao corretamente.
    const candidates = await prisma.$queryRaw<
      Array<{
        id: string;
        tenant_id: string;
        number: string;
        customer_id: string;
        warranty_months: number;
        warranty_expires_at: Date;
      }>
    >`
      SELECT
        so.id,
        so.tenant_id,
        so.number,
        so.customer_id,
        so.warranty_months,
        (so.completed_date + (so.warranty_months || ' months')::interval)::timestamp AS warranty_expires_at
      FROM service_orders so
      WHERE so.deleted_at IS NULL
        AND so.status IN ('DELIVERED', 'PAID')
        AND so.completed_date IS NOT NULL
        AND so.warranty_months > 0
        AND so.warranty_expiry_notified_at IS NULL
        AND (so.completed_date + (so.warranty_months || ' months')::interval) BETWEEN ${now} AND ${horizon}
      LIMIT 500
    `;

    let sent = 0;
    let failed = 0;
    for (const os of candidates) {
      const customer = await prisma.customer.findUnique({
        where: { id: os.customer_id },
        select: { name: true, phone: true },
      });
      if (!customer?.phone) {
        // Sem telefone, marca notificacao "pulada" pra nao reaparecer.
        await prisma.serviceOrder.update({
          where: { id: os.id },
          data: { warrantyExpiryNotifiedAt: new Date() },
        });
        continue;
      }

      const expiresStr = os.warranty_expires_at.toLocaleDateString("pt-BR");
      const customerName = customer.name ?? "Cliente";
      const daysLeft = Math.max(
        1,
        Math.ceil((os.warranty_expires_at.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
      );

      const text =
        `Ola, ${customerName}!\n\n` +
        `A garantia da sua Ordem de Servico #${os.number} vai vencer em ` +
        `${daysLeft} dia${daysLeft > 1 ? "s" : ""} (${expiresStr}).\n\n` +
        `Se observar algum problema no aparelho, entre em contato conosco antes do vencimento ` +
        `para acionarmos a garantia.\n\nArena Tech`;

      try {
        const res = await sendTextWithFallback({
          phone: customer.phone,
          freeText: text,
          contexto: "os_garantia_vencendo",
          params: [customerName, os.number, expiresStr],
        });
        if (res.success) {
          sent++;
          await prisma.serviceOrder.update({
            where: { id: os.id },
            data: { warrantyExpiryNotifiedAt: new Date() },
          });
        } else {
          failed++;
          logger.warn("[cron-warranty-expiring] falha envio", {
            osId: os.id,
            number: os.number,
            error: res.error,
          });
        }
      } catch (err) {
        failed++;
        logger.warn("[cron-warranty-expiring] erro de rede", {
          osId: os.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    logger.info("[cron-warranty-expiring] processed", {
      candidates: candidates.length,
      sent,
      failed,
    });

    return NextResponse.json({
      success: true,
      candidates: candidates.length,
      sent,
      failed,
    });
  } catch (err) {
    logger.error("[cron-warranty-expiring] failed", {
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
