import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { verifyPublicPdfToken } from "@/lib/whatsapp/public-pdf-token";
import { buildServiceOrderQuotePdf } from "@/lib/pdf/service-order-quote-builder";

export const runtime = "nodejs";

/**
 * GET /api/whatsapp-media/os-quote/pdf/[token]
 *
 * Rota PUBLICA (sem auth) usada pela Meta Cloud API para baixar o PDF do
 * orcamento adicional (revisao) referenciado em templates com HEADER
 * DOCUMENT. Token HMAC-assinado, TTL 1h.
 *
 * Distinto de `/api/whatsapp-media/os/pdf/[token]` que serve o PDF
 * principal da OS. Esta rota serve a comparacao previous vs new do
 * `requestBudgetApproval` — paridade Laravel `gerarPdfOrcamento`.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const payload = verifyPublicPdfToken(token);
  if (!payload) {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 403 });
  }

  try {
    const pdfBuffer = await buildServiceOrderQuotePdf(payload.tenantId, payload.orderId);
    if (!pdfBuffer) {
      return NextResponse.json({ error: "OS or quote not found" }, { status: 404 });
    }
    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Cache-Control": "public, max-age=300",
        "Content-Length": String(pdfBuffer.length),
      },
    });
  } catch (err) {
    logger.error("public OS-quote PDF error:", { err: String(err) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
