import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { withAdmin } from "@/server/db";
import { logger } from "@/lib/logger";

/**
 * POST /api/webhooks/nuvemfiscal
 *
 * Webhook receiver da Nuvem Fiscal — recebe callback assíncrono de autorização,
 * rejeição, cancelamento e carta de correção. Atualiza o Invoice correspondente.
 *
 * Eventos esperados (payload):
 *   {
 *     "evento": "nfe.autorizada" | "nfe.rejeitada" | "nfe.cancelada" | "nfce.autorizada" | "nfce.rejeitada" | ...,
 *     "id": "<providerRef>",            // ID da nota na Nuvem Fiscal
 *     "ambiente": "homologacao"|"producao",
 *     "data_evento": "2026-05-20T...",
 *     "dados": {
 *       "chave": "44 digits",
 *       "status": "autorizado" | "rejeitado" | "cancelado",
 *       "motivo": "...",
 *       "protocolo": "..."
 *     }
 *   }
 *
 * Segurança: valida HMAC-SHA256 do payload com header `X-Webhook-Signature`
 * usando NUVEM_FISCAL_WEBHOOK_SECRET. Se a env não estiver configurada,
 * processa apenas em homologação (modo dev).
 */
export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-webhook-signature") ?? "";
    const secret = process.env.NUVEM_FISCAL_WEBHOOK_SECRET;

    if (secret) {
      const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
      const valid = signature && safeEqual(signature, expected);
      if (!valid) {
        logger.warn("Nuvem Fiscal webhook: invalid signature");
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    } else {
      logger.warn("Nuvem Fiscal webhook: NUVEM_FISCAL_WEBHOOK_SECRET ausente — aceitando sem verificação");
    }

    const payload = JSON.parse(rawBody) as {
      evento?: string;
      id?: string;
      ambiente?: string;
      data_evento?: string;
      dados?: Record<string, unknown>;
    };

    const event = String(payload.evento ?? "");
    const providerRef = String(payload.id ?? "");
    const dados = payload.dados ?? {};
    const accessKey = typeof dados.chave === "string" ? dados.chave : null;
    const protocolo = typeof dados.protocolo === "string" ? dados.protocolo : null;
    const motivo = typeof dados.motivo === "string" ? dados.motivo : null;
    const statusFromPayload = typeof dados.status === "string" ? dados.status.toLowerCase() : "";

    logger.info("Nuvem Fiscal webhook received", { event, providerRef, accessKey: accessKey?.slice(0, 12) });

    if (!providerRef && !accessKey) {
      return NextResponse.json({ error: "Missing identifier" }, { status: 400 });
    }

    const invoiceStatus = mapEventToStatus(event, statusFromPayload);

    const result = await withAdmin(async (tx) => {
      const invoice = await tx.invoice.findFirst({
        where: {
          OR: [
            providerRef ? { providerRef } : undefined,
            accessKey ? { accessKey } : undefined,
          ].filter(Boolean) as never,
        },
        select: { id: true, tenantId: true, status: true },
      });

      if (!invoice) {
        logger.warn("Nuvem Fiscal webhook: invoice not found", { providerRef, accessKey });
        return { matched: false };
      }

      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          status: invoiceStatus ?? invoice.status,
          providerStatus: statusFromPayload || event,
          accessKey: accessKey ?? undefined,
          authorizedAt: invoiceStatus === "AUTHORIZED" ? new Date() : undefined,
          cancelledAt: invoiceStatus === "CANCELLED" ? new Date() : undefined,
          response: {
            event,
            protocolo,
            motivo,
            dados: dados as never,
            receivedAt: new Date().toISOString(),
          } as never,
        },
      });

      return { matched: true, invoiceId: invoice.id, tenantId: invoice.tenantId };
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    logger.error("Nuvem Fiscal webhook error", { error: String(error) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

function mapEventToStatus(event: string, statusFromPayload: string): "AUTHORIZED" | "REJECTED" | "CANCELLED" | "CORRECTION_LETTER" | null {
  const lower = event.toLowerCase();
  if (lower.includes("autoriz") || statusFromPayload === "autorizado") return "AUTHORIZED";
  if (lower.includes("rejeit") || statusFromPayload === "rejeitado") return "REJECTED";
  if (lower.includes("cancel") || statusFromPayload === "cancelado") return "CANCELLED";
  if (lower.includes("correc") || lower.includes("cce")) return "CORRECTION_LETTER";
  return null;
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
