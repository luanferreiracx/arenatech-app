import { NextRequest, NextResponse } from "next/server";
import { verifyPublicPdfToken } from "@/lib/whatsapp/public-pdf-token";
import { buildSaleReceiptPdf } from "@/lib/pdf/sale-receipt-builder";

export const runtime = "nodejs";

/**
 * GET /api/whatsapp-media/sale/pdf/[token]
 *
 * Rota PUBLICA (sem auth) usada pela Meta Cloud API para baixar o PDF do
 * recibo/termo de venda em templates com HEADER DOCUMENT. Token HMAC com
 * TTL 1h e escopo (tenantId, saleId).
 *
 * Paridade Laravel route('whatsapp-media.pdv.recibo').
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
    const pdfBuffer = await buildSaleReceiptPdf(payload.tenantId, payload.orderId);
    if (!pdfBuffer) {
      return NextResponse.json({ error: "Venda nao encontrada" }, { status: 404 });
    }
    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Cache-Control": "public, max-age=300",
        "Content-Length": String(pdfBuffer.length),
      },
    });
  } catch (err) {
    console.error("public sale PDF error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
