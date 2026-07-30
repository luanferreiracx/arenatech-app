import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { auth } from "@/server/auth";
import { isModuleAllowedForTenant, moduleDeniedMessage } from "@/server/auth/module-gate";
import { resolveActiveTenant } from "@/lib/auth/active-tenant";
import { buildServiceOrderReciboPdf } from "@/lib/pdf/service-order-terms-builder";

export const runtime = "nodejs";

/**
 * GET /api/service-orders/[id]/recibo
 *
 * Recibo de servico em PDF binario (@react-pdf) — paridade Laravel
 * OrdemServicoPdfController::gerarHtmlRecibo (dompdf). "RECIBO", valor por
 * extenso, servicos realizados, garantia, assinatura eletronica do prestador,
 * "SEM VALOR FISCAL".
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
  const tenantId = resolveActiveTenant(session, req.cookies.get("x-active-tenant")?.value)?.id;
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
    const pdf = await buildServiceOrderReciboPdf(tenantId, id);
    if (!pdf) {
      return NextResponse.json({ error: "OS not found" }, { status: 404 });
    }
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="recibo-os-${id.slice(0, 8)}.pdf"`,
      },
    });
  } catch (err) {
    logger.error("Recibo OS PDF error", { err: String(err) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
