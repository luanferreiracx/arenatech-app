import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { auth } from "@/server/auth";
import { withAdmin } from "@/server/db";
import { renderPdfToBuffer } from "@/lib/pdf/render";
import { loadTenantHeader, formatDoc } from "@/lib/pdf/tenant-header";
import { TechnicianReportPdfDocument } from "@/lib/pdf/technician-report-pdf";
import { buildTechnicianReportWithTenant } from "@/server/services/os-technician-report.service";

export const runtime = "nodejs";

/**
 * GET /api/service-orders/technician-report/pdf
 *
 * Query params:
 *   - dateFrom: YYYY-MM-DD
 *   - dateTo:   YYYY-MM-DD
 *   - technicianId: uuid (opcional)
 *
 * Renderiza o relatorio agregado por tecnico no mesmo formato visual da UI
 * de tela. Paridade Laravel `relatorioTecnicos?formato=pdf`.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenantId = req.cookies.get("x-active-tenant")?.value ?? session.activeTenantId;
  if (!tenantId) {
    return NextResponse.json({ error: "No active tenant" }, { status: 403 });
  }

  const url = new URL(req.url);
  const dateFrom = url.searchParams.get("dateFrom") ?? "";
  const dateTo = url.searchParams.get("dateTo") ?? "";
  const technicianId = url.searchParams.get("technicianId") ?? "";

  try {
    // Mesma logica de agregacao do procedure technicianReport (service compartilhado)
    // — antes a logica era duplicada com pequenas diferencas de arredondamento.
    const { items, totals } = await buildTechnicianReportWithTenant(tenantId, {
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      technicianId: technicianId || undefined,
    });
    const totalsAgg = {
      ...totals,
      ticketMedio: totals.completed > 0 ? Math.round(totals.totalValue / totals.completed) : 0,
    };

    // Nome do tecnico filtrado (header do PDF) — busca cross-tenant via withAdmin.
    let technicianName: string | null = null;
    if (technicianId) {
      const u = await withAdmin(async (adminTx) =>
        adminTx.user.findUnique({ where: { id: technicianId }, select: { name: true } }),
      );
      technicianName = u?.name ?? null;
    }

    const header = await loadTenantHeader(tenantId);

    const buffer = await renderPdfToBuffer(
      TechnicianReportPdfDocument({
        store: {
          name: header.storeName,
          cnpj: formatDoc(header.cnpj),
          phone: header.phone,
          address: header.address,
          logoDataUrl: header.logoDataUrl,
        },
        period: { from: dateFrom, to: dateTo },
        technicianName,
        items,
        totals: totalsAgg,
      }),
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new NextResponse(buffer as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="relatorio-tecnicos-${dateFrom}_${dateTo}.pdf"`,
      },
    });
  } catch (err) {
    logger.error("Technician report PDF error:", { err: String(err) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
