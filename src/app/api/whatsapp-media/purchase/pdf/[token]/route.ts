import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { verifyPublicPdfToken } from "@/lib/whatsapp/public-pdf-token";

export const runtime = "nodejs";

/**
 * GET /api/whatsapp-media/purchase/pdf/[token]
 *
 * Rota PUBLICA (sem auth) usada pela Meta Cloud API para baixar PDF do
 * termo de responsabilidade da compra de aparelho. Token HMAC com TTL 1h,
 * escopo (tenantId, purchaseId, "purchase_term").
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const payload = verifyPublicPdfToken(token);
  if (!payload || payload.kind !== "purchase_term") {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 403 });
  }

  try {
    const { buildPurchaseTermPdf } = await import("@/lib/pdf/purchase-term-builder");
    const pdfBuffer = await buildPurchaseTermPdf(payload.tenantId, payload.orderId);
    if (!pdfBuffer) {
      return NextResponse.json({ error: "Compra nao encontrada" }, { status: 404 });
    }
    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Cache-Control": "public, max-age=300",
        "Content-Length": String(pdfBuffer.length),
      },
    });
  } catch (err) {
    logger.error("public purchase term PDF error:", { err: String(err) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
