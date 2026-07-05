import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { auth } from "@/server/auth";
import { resolveActiveTenant } from "@/lib/auth/active-tenant";
import { buildProviderApuracaoCsv } from "@/lib/pdf/provider-apuracao-builder";
import { assertCanExportApuracao } from "@/lib/pdf/apuracao-export-auth";

export const runtime = "nodejs";

/**
 * GET /api/commissions/[providerId]/apuracao/[year]/[month]/csv
 *
 * Exporta a memoria de calculo da apuracao em CSV. Acesso: admin do tenant OU o
 * proprio prestador (dono da apuracao).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ providerId: string; year: string; month: string }> },
) {
  const { providerId, year, month } = await params;
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenantId = resolveActiveTenant(session, req.cookies.get("x-active-tenant")?.value)?.id;
  if (!tenantId) {
    return NextResponse.json({ error: "No active tenant" }, { status: 403 });
  }

  const y = Number(year);
  const m = Number(month);
  if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) {
    return NextResponse.json({ error: "Invalid period" }, { status: 400 });
  }

  try {
    const allowed = await assertCanExportApuracao(session, tenantId, providerId);
    if (!allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const csv = await buildProviderApuracaoCsv(tenantId, providerId, y, m);
    if (csv === null) {
      return NextResponse.json({ error: "Apuracao not found" }, { status: 404 });
    }

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="comissao-${y}-${String(m).padStart(2, "0")}.csv"`,
      },
    });
  } catch (err) {
    logger.error("Apuracao CSV error:", { err: String(err) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
