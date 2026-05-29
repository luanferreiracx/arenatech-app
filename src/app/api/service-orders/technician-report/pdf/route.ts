import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { auth } from "@/server/auth";
import { withTenant, withAdmin } from "@/server/db";
import { Prisma } from "@prisma/client";
import { renderPdfToBuffer } from "@/lib/pdf/render";
import { loadTenantHeader, formatDoc } from "@/lib/pdf/tenant-header";
import {
  TechnicianReportPdfDocument,
  type TechnicianReportItem,
  type TechnicianReportTotals,
} from "@/lib/pdf/technician-report-pdf";
import { endOfDayBrt, startOfDayBrt } from "@/lib/utils/date-range";

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
    // Reusa a mesma logica de agregacao do procedure `technicianReport`.
    const where: Prisma.ServiceOrderWhereInput = { tenantId };
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = startOfDayBrt(dateFrom);
      if (dateTo) where.createdAt.lte = endOfDayBrt(dateTo);
    }
    if (technicianId) where.technicianId = technicianId;

    const orders = await withTenant(tenantId, async (tx) =>
      tx.serviceOrder.findMany({
        where,
        select: {
          technicianId: true,
          status: true,
          serviceAmount: true,
          partsAmount: true,
          totalAmount: true,
          partsCost: true,
          otherCost: true,
          createdAt: true,
          completedDate: true,
        },
      }),
    );

    const byTech = new Map<
      string,
      {
        technicianId: string;
        totalOs: number;
        completed: number;
        cancelled: number;
        serviceValue: number;
        partsValue: number;
        totalValue: number;
        partsCost: number;
        otherCost: number;
        totalDays: number;
        completedCount: number;
      }
    >();
    for (const o of orders) {
      const techId = o.technicianId ?? "__unassigned__";
      let e = byTech.get(techId);
      if (!e) {
        e = {
          technicianId: techId,
          totalOs: 0,
          completed: 0,
          cancelled: 0,
          serviceValue: 0,
          partsValue: 0,
          totalValue: 0,
          partsCost: 0,
          otherCost: 0,
          totalDays: 0,
          completedCount: 0,
        };
        byTech.set(techId, e);
      }
      e.totalOs++;
      if (o.status === "COMPLETED" || o.status === "DELIVERED") e.completed++;
      if (o.status === "CANCELLED") e.cancelled++;
      e.serviceValue += Number(o.serviceAmount ?? 0);
      e.partsValue += Number(o.partsAmount ?? 0);
      e.totalValue += Number(o.totalAmount ?? 0);
      e.partsCost += Number(o.partsCost ?? 0);
      e.otherCost += Number(o.otherCost ?? 0);
      if (o.completedDate && o.createdAt) {
        e.totalDays += (o.completedDate.getTime() - o.createdAt.getTime()) / (1000 * 60 * 60 * 24);
        e.completedCount++;
      }
    }

    const techIds = [...byTech.keys()].filter((id) => id !== "__unassigned__");
    const users = await withAdmin(async (adminTx) =>
      adminTx.user.findMany({
        where: { id: { in: techIds } },
        select: { id: true, name: true },
      }),
    );
    const nameMap = new Map(users.map((u) => [u.id, u.name]));

    const items: TechnicianReportItem[] = [...byTech.values()]
      .map((e) => {
        const totalValueCents = Math.round(e.totalValue * 100);
        const partsCostCents = Math.round(e.partsCost * 100);
        const otherCostCents = Math.round(e.otherCost * 100);
        const profit = totalValueCents - partsCostCents - otherCostCents;
        const ticketMedio = e.completed > 0 ? Math.round((e.totalValue * 100) / e.completed) : 0;
        const avgDays = e.completedCount > 0 ? Math.round(e.totalDays / e.completedCount) : null;
        return {
          technicianName: nameMap.get(e.technicianId) ?? "Nao identificado",
          totalOs: e.totalOs,
          completed: e.completed,
          cancelled: e.cancelled,
          serviceValue: Math.round(e.serviceValue * 100),
          partsValue: Math.round(e.partsValue * 100),
          totalValue: totalValueCents,
          partsCost: partsCostCents,
          otherCost: otherCostCents,
          profit,
          ticketMedio,
          avgDays,
        };
      })
      .sort((a, b) => b.totalValue - a.totalValue);

    const totalsAgg = items.reduce(
      (acc, i) => {
        acc.totalOs += i.totalOs;
        acc.completed += i.completed;
        acc.cancelled += i.cancelled;
        acc.serviceValue += i.serviceValue;
        acc.partsValue += i.partsValue;
        acc.totalValue += i.totalValue;
        acc.partsCost += i.partsCost;
        acc.otherCost += i.otherCost;
        acc.profit += i.profit;
        return acc;
      },
      {
        totalOs: 0,
        completed: 0,
        cancelled: 0,
        serviceValue: 0,
        partsValue: 0,
        totalValue: 0,
        partsCost: 0,
        otherCost: 0,
        profit: 0,
        ticketMedio: 0,
      } as TechnicianReportTotals,
    );
    totalsAgg.ticketMedio =
      totalsAgg.completed > 0 ? Math.round(totalsAgg.totalValue / totalsAgg.completed) : 0;

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
        technicianName: technicianId ? (nameMap.get(technicianId) ?? null) : null,
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
