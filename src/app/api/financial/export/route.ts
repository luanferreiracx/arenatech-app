import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { resolveActiveTenant } from "@/lib/auth/active-tenant";
import { withTenant } from "@/server/db";

/**
 * GET /api/financial/export?type=transactions&format=csv&from=...&to=...&txType=PAYABLE|RECEIVABLE&status=...
 *
 * Exportação CSV de transações financeiras (paridade Laravel
 * `FinanceiroController::exportarRecebimentos` / `ContaPagarController::export`).
 *
 * Tipos suportados:
 * - transactions: todas as transações (header com cabeçalho enxuto)
 * - installments: parcelas paginadas (para recebimentos / pendentes)
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cookies = req.cookies;
  const tenantId = resolveActiveTenant(session, cookies.get("x-active-tenant")?.value)?.id;
  if (!tenantId) {
    return NextResponse.json({ error: "No active tenant" }, { status: 403 });
  }

  const url = new URL(req.url);
  const type = url.searchParams.get("type") ?? "transactions";
  const txType = url.searchParams.get("txType"); // PAYABLE | RECEIVABLE
  const status = url.searchParams.get("status"); // PENDING|PAID|...
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  try {
    if (type === "transactions") {
      const data = await withTenant(tenantId, async (tx) => {
        const where: Record<string, unknown> = { deletedAt: null };
        if (txType) where.type = txType;
        if (status) where.status = status;
        if (from || to) {
          const range: Record<string, Date> = {};
          if (from) range.gte = new Date(from);
          if (to) range.lte = new Date(to);
          where.dueDate = range;
        }
        return tx.financialTransaction.findMany({
          where,
          orderBy: { dueDate: "desc" },
          take: 5000,
        });
      });

      const csv = buildCsv(
        ["Tipo", "Status", "Descrição", "Fornecedor/Cliente", "Categoria", "Total", "Pago", "Parcelas", "Vencimento", "Emissão", "Pago em"],
        data.map((t) => [
          t.type,
          t.status,
          t.description,
          t.supplier ?? t.customerName ?? "",
          t.category ?? "",
          formatBr(t.totalAmount),
          formatBr(t.paidAmount),
          String(t.installmentsTotal),
          formatDate(t.dueDate),
          t.emissionDate ? formatDate(t.emissionDate) : "",
          t.paidAt ? formatDate(t.paidAt) : "",
        ]),
      );

      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="financeiro-transacoes-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    }

    if (type === "installments") {
      const data = await withTenant(tenantId, async (tx) => {
        const where: Record<string, unknown> = {};
        if (status) where.status = status;
        if (from || to) {
          const range: Record<string, Date> = {};
          if (from) range.gte = new Date(from);
          if (to) range.lte = new Date(to);
          where.dueDate = range;
        }
        return tx.installment.findMany({
          where,
          orderBy: { dueDate: "desc" },
          take: 5000,
          include: { transaction: true },
        });
      });

      const csv = buildCsv(
        ["Transação", "Tipo", "Descrição", "Parcela", "Status", "Valor", "Pago", "Vencimento", "Pago em", "Forma"],
        data.map((i) => [
          i.transactionId.slice(0, 8),
          i.transaction.type,
          i.transaction.description,
          `${i.number}/${i.transaction.installmentsTotal}`,
          i.status,
          formatBr(i.amount),
          formatBr(i.paidAmount),
          formatDate(i.dueDate),
          i.paidAt ? formatDate(i.paidAt) : "",
          i.paymentMethod ?? "",
        ]),
      );

      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="financeiro-parcelas-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    }

    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 },
    );
  }
}

function buildCsv(headers: string[], rows: string[][]): string {
  const lines = [headers, ...rows].map((row) =>
    row.map((cell) => csvCell(cell)).join(";"),
  );
  // BOM para Excel reconhecer UTF-8
  return "﻿" + lines.join("\r\n");
}

function csvCell(value: string): string {
  const safe = value ?? "";
  if (/[";\r\n]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

function formatBr(amount: unknown): string {
  const num = typeof amount === "number" ? amount : Number(amount ?? 0);
  return num.toFixed(2).replace(".", ",");
}

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString("pt-BR");
}
