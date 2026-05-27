import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { auth } from "@/server/auth";
import { buildSaleDeliveryPdf } from "@/lib/pdf/sale-delivery-builder";

export const runtime = "nodejs";

/**
 * GET /api/pdv/[id]/termo-entrega
 *
 * Gera PDF binario do termo de entrega da venda. Paridade visual Laravel
 * intranetpdv `termo-entrega.blade.php`.
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

  const tenantId =
    req.cookies.get("x-active-tenant")?.value ?? session.activeTenantId;
  if (!tenantId) {
    return NextResponse.json({ error: "No active tenant" }, { status: 403 });
  }

  try {
    const buffer = await buildSaleDeliveryPdf(tenantId, id);
    if (!buffer) {
      return NextResponse.json({ error: "Venda nao encontrada" }, { status: 404 });
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new NextResponse(buffer as any, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="termo-entrega-${id.slice(0, 8)}.pdf"`,
      },
    });
  } catch (err) {
    logger.error("Delivery term PDF error:", { err: String(err) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
