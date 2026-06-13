import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { auth } from "@/server/auth";
import { resolveActiveTenant } from "@/lib/auth/active-tenant";
import { buildSaleWarrantyPdf } from "@/lib/pdf/sale-warranty-builder";

export const runtime = "nodejs";

/**
 * GET /api/pdv/[id]/termo-garantia
 *
 * Gera PDF binario do termo de garantia da venda. Paridade visual Laravel
 * intranetpdv `termo-garantia.blade.php`.
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
    resolveActiveTenant(session, req.cookies.get("x-active-tenant")?.value)?.id;
  if (!tenantId) {
    return NextResponse.json({ error: "No active tenant" }, { status: 403 });
  }

  try {
    const buffer = await buildSaleWarrantyPdf(tenantId, id);
    if (!buffer) {
      return NextResponse.json({ error: "Venda nao encontrada" }, { status: 404 });
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new NextResponse(buffer as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="termo-garantia-${id.slice(0, 8)}.pdf"`,
      },
    });
  } catch (err) {
    logger.error("Warranty term PDF error:", { err: String(err) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
