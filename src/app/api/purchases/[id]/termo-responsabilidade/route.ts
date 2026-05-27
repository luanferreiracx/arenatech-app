import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { auth } from "@/server/auth";
import { buildPurchaseTermPdf } from "@/lib/pdf/purchase-term-builder";

export const runtime = "nodejs";

/**
 * GET /api/purchases/[id]/termo-responsabilidade
 *
 * Gera PDF binario do termo de responsabilidade da compra de aparelho.
 * Paridade Laravel CompraAparelhoController::termoResponsabilidade.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenantId = req.cookies.get("x-active-tenant")?.value ?? session.activeTenantId;
  if (!tenantId) {
    return NextResponse.json({ error: "No active tenant" }, { status: 403 });
  }

  try {
    const pdfBuffer = await buildPurchaseTermPdf(tenantId, id);
    if (!pdfBuffer) {
      return NextResponse.json({ error: "Compra nao encontrada" }, { status: 404 });
    }
    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="termo-responsabilidade-${id.slice(0, 8)}.pdf"`,
        "Content-Length": String(pdfBuffer.length),
      },
    });
  } catch (err) {
    logger.error("Purchase term PDF error:", { err: String(err) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
