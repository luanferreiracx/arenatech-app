import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { auth } from "@/server/auth";
import { buildServiceOrderQuotePdf } from "@/lib/pdf/service-order-quote-builder";

/**
 * GET /api/service-orders/[id]/quote-pdf
 *
 * PDF do orcamento adicional (revisao). Paridade Laravel
 * `OrdemServicoPdfController::gerarPdfOrcamento`.
 *
 * Antes este endpoint retornava HTML — o operador clicava em "PDF do
 * orcamento" e abria uma pagina web em vez de baixar PDF, e a mensagem
 * WhatsApp do `requestBudgetApproval` anexava o PDF da OS principal no
 * lugar do PDF da revisao (cliente nao via comparacao anterior/novo).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cookies = _req.cookies;
  const tenantId = cookies.get("x-active-tenant")?.value ?? session.activeTenantId;

  if (!tenantId) {
    return NextResponse.json({ error: "No active tenant" }, { status: 403 });
  }

  try {
    const buffer = await buildServiceOrderQuotePdf(tenantId, id);
    if (!buffer) {
      return NextResponse.json({ error: "OS or quote not found" }, { status: 404 });
    }

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="orcamento-${id}.pdf"`,
      },
    });
  } catch (error) {
    logger.error("Quote PDF error:", { err: String(error) });
    return NextResponse.json(
      { error: "Failed to generate quote PDF" },
      { status: 500 },
    );
  }
}
