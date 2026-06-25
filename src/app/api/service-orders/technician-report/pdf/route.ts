import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { auth } from "@/server/auth";
import { resolveActiveTenant } from "@/lib/auth/active-tenant";
import { withAdmin, withTenant } from "@/server/db";
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
 *   - technicianId: uuid (opcional, técnico interno)
 *   - serviceProviderId: uuid (opcional, prestador externo) — exclusivo com technicianId
 *
 * Renderiza o relatorio agregado por tecnico no mesmo formato visual da UI
 * de tela. Paridade Laravel `relatorioTecnicos?formato=pdf`.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenantId = resolveActiveTenant(session, req.cookies.get("x-active-tenant")?.value)?.id;
  if (!tenantId) {
    return NextResponse.json({ error: "No active tenant" }, { status: 403 });
  }

  const url = new URL(req.url);
  const dateFrom = url.searchParams.get("dateFrom") ?? "";
  const dateTo = url.searchParams.get("dateTo") ?? "";
  const technicianId = url.searchParams.get("technicianId") ?? "";
  const serviceProviderId = url.searchParams.get("serviceProviderId") ?? "";

  try {
    // Mesma logica de agregacao do procedure technicianReport (service compartilhado)
    // — antes a logica era duplicada com pequenas diferencas de arredondamento.
    const { items, totals } = await buildTechnicianReportWithTenant(tenantId, {
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      technicianId: technicianId || undefined,
      serviceProviderId: serviceProviderId || undefined,
    });
    const totalsAgg = {
      ...totals,
      ticketMedio: totals.completed > 0 ? Math.round(totals.totalValue / totals.completed) : 0,
    };

    // Nome do responsável filtrado (header do PDF): usuário interno (admin,
    // cross-tenant) OU prestador externo (tenant-scoped).
    let technicianName: string | null = null;
    if (technicianId) {
      const u = await withAdmin(async (adminTx) =>
        adminTx.user.findUnique({ where: { id: technicianId }, select: { name: true } }),
      );
      technicianName = u?.name ?? null;
    } else if (serviceProviderId) {
      const p = await withTenant(tenantId, (tx) =>
        tx.serviceProvider.findUnique({ where: { id: serviceProviderId }, select: { name: true } }),
      );
      technicianName = p?.name ? `${p.name} (prestador)` : null;
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
