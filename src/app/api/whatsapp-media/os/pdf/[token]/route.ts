import { NextRequest, NextResponse } from "next/server";
import { verifyPublicPdfToken } from "@/lib/whatsapp/public-pdf-token";
import { buildServiceOrderPdf } from "@/lib/pdf/service-order-pdf-builder";

export const runtime = "nodejs";

/**
 * GET /api/whatsapp-media/os/pdf/[token]
 *
 * Rota PUBLICA (sem auth) usada pela Meta Cloud API para baixar o PDF
 * referenciado em templates com HEADER DOCUMENT. O token e HMAC-assinado,
 * com prazo 1h e escopo (tenantId, orderId).
 *
 * Equivalente Laravel: route('whatsapp-media.os.recibo') / route('whatsapp-media.os.orcamento').
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
    const pdfBuffer = await buildServiceOrderPdf(payload.tenantId, payload.orderId);
    if (!pdfBuffer) {
      return NextResponse.json({ error: "OS not found" }, { status: 404 });
    }
    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        // Cache curto na CDN da Meta (e ja respeitamos o TTL do token).
        "Cache-Control": "public, max-age=300",
        "Content-Length": String(pdfBuffer.length),
      },
    });
  } catch (err) {
    console.error("public PDF error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
