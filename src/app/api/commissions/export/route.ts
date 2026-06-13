import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { resolveActiveTenant } from "@/lib/auth/active-tenant";
import { withTenant, withAdmin } from "@/server/db";

/**
 * GET /api/commissions/export?from=YYYY-MM-DD&to=YYYY-MM-DD&status=PENDING|APPROVED|PAID|CANCELLED&userId=...
 *
 * Exportação CSV de comissões. Paridade Laravel `ComissaoController::exportarCsv`.
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
  const year = url.searchParams.get("year");
  const month = url.searchParams.get("month");
  const status = url.searchParams.get("status");
  const userId = url.searchParams.get("userId");

  try {
    const commissions = await withTenant(tenantId, async (tx) => {
      const where: Record<string, unknown> = {};
      if (status) where.status = status;
      if (userId) where.userId = userId;
      if (year) where.periodYear = Number(year);
      if (month) where.periodMonth = Number(month);
      return tx.commission.findMany({
        where,
        orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }, { userId: "asc" }],
        take: 5000,
      });
    });

    // Resolve user names (cross-tenant via withAdmin)
    const userIds = Array.from(new Set(commissions.map((c) => c.userId)));
    const users = userIds.length > 0
      ? await withAdmin(async (tx) =>
          tx.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, name: true },
          }),
        )
      : [];
    const nameById = new Map(users.map((u) => [u.id, u.name]));

    const csv = buildCsv(
      ["Período", "Usuário", "Tipo", "Status", "Base", "Taxa %", "Valor", "Referência"],
      commissions.map((c) => [
        `${String(c.periodMonth).padStart(2, "0")}/${c.periodYear}`,
        nameById.get(c.userId) ?? c.userId.slice(0, 8),
        c.type,
        c.status,
        formatBr(c.baseAmount),
        formatBr(c.ratePercent),
        formatBr(c.commissionAmount),
        `${c.referenceType}#${c.referenceNumber}`,
      ]),
    );

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="comissoes-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 },
    );
  }
}

function buildCsv(headers: string[], rows: string[][]): string {
  const lines = [headers, ...rows].map((row) => row.map(csvCell).join(";"));
  return "﻿" + lines.join("\r\n");
}

function csvCell(value: string): string {
  const safe = value ?? "";
  if (/[";\r\n]/.test(safe)) return `"${safe.replace(/"/g, '""')}"`;
  return safe;
}

function formatBr(amount: unknown): string {
  const num = typeof amount === "number" ? amount : Number(amount ?? 0);
  return num.toFixed(2).replace(".", ",");
}
