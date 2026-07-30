import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { auth } from "@/server/auth";
import { isModuleAllowedForTenant, moduleDeniedMessage } from "@/server/auth/module-gate";
import { resolveActiveTenant } from "@/lib/auth/active-tenant";
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
  const tenantId = resolveActiveTenant(session, cookies.get("x-active-tenant")?.value)?.id;

  if (!tenantId) {
    return NextResponse.json({ error: "No active tenant" }, { status: 403 });
  }

  // Gating de plano na borda REST: o proxy isenta `/api/*` de propósito e o
  // `tenantProcedure` não passa por aqui. Sem isto, um tenant sem o módulo
  // baixava este arquivo pela rota REST mesmo sem conseguir chamar o tRPC.
  if (!isModuleAllowedForTenant(session, tenantId, "service-orders")) {
    return NextResponse.json({ error: moduleDeniedMessage("service-orders") }, { status: 403 });
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
