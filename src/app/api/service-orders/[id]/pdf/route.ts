import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { buildServiceOrderPdf } from "@/lib/pdf/service-order-pdf-builder";

export const runtime = "nodejs";

/**
 * GET /api/service-orders/[id]/pdf
 *
 * Gera PDF binario da OS via @react-pdf/renderer.
 * Paridade: Laravel OrdemServicoPdfController (dompdf).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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
    const pdfBuffer = await buildServiceOrderPdf(tenantId, id);
    if (!pdfBuffer) {
      return NextResponse.json({ error: "OS not found" }, { status: 404 });
    }

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="OS-${id}.pdf"`,
        "Content-Length": String(pdfBuffer.length),
      },
    });
  } catch (err) {
    console.error("PDF generation error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
