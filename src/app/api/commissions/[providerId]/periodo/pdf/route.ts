import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { auth } from "@/server/auth";
import { isModuleAllowedForTenant, moduleDeniedMessage } from "@/server/auth/module-gate";
import { resolveActiveTenant } from "@/lib/auth/active-tenant";
import { buildProviderPeriodCommissionPdf } from "@/lib/pdf/provider-apuracao-builder";
import { assertCanExportApuracao } from "@/lib/pdf/apuracao-export-auth";
import { previewCommissionByPeriodSchema } from "@/lib/validators/provider-commission";

export const runtime = "nodejs";

/**
 * GET /api/commissions/[providerId]/periodo/pdf?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 *
 * Exporta a PREVIA de comissao por periodo livre em PDF — so comissao (sem ajuda
 * de custo nem estornos), sem persistir. Acesso: admin do tenant OU o proprio
 * prestador.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ providerId: string }> },
) {
  const { providerId } = await params;
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
  if (!isModuleAllowedForTenant(session, tenantId, "commissions")) {
    return NextResponse.json({ error: moduleDeniedMessage("commissions") }, { status: 403 });
  }

  const parsed = previewCommissionByPeriodSchema.safeParse({
    providerId,
    startDate: req.nextUrl.searchParams.get("startDate"),
    endDate: req.nextUrl.searchParams.get("endDate"),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid period" }, { status: 400 });
  }
  const { startDate, endDate } = parsed.data;

  try {
    const allowed = await assertCanExportApuracao(session, tenantId, providerId);
    if (!allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const pdf = await buildProviderPeriodCommissionPdf(tenantId, providerId, startDate, endDate);
    if (!pdf) {
      return NextResponse.json({ error: "Provider not found" }, { status: 404 });
    }

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="comissao-periodo-${startDate}-a-${endDate}.pdf"`,
        "Content-Length": String(pdf.length),
      },
    });
  } catch (err) {
    logger.error("Period commission PDF error:", { err: String(err) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
