import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { withTenant, withAdmin } from "@/server/db";
import { renderPdfToBuffer } from "@/lib/pdf/render";
import type { DocumentProps } from "@react-pdf/renderer";
import type { ReactElement } from "react";
import {
  StockReportPdf,
  type ReportColumn,
} from "@/lib/pdf/stock-report-pdf";

export const runtime = "nodejs";

type ReportType =
  | "posicao-estoque"
  | "estoque-minimo"
  | "vendas-periodo"
  | "vendas-vendedor"
  | "vendas-produto"
  | "curva-abc";

const fmtCurrency = (cents: number) =>
  "R$ " +
  (cents / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const fmtDecimal = (v: unknown) =>
  "R$ " +
  Number(v).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const fmtDate = (d: Date | string) =>
  new Date(d).toLocaleDateString("pt-BR");

/**
 * GET /api/reports/stock/[type]?dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD
 *
 * Gera PDF binario de um relatorio de estoque/vendas. Tipos suportados:
 *   - posicao-estoque
 *   - estoque-minimo
 *   - vendas-periodo
 *   - vendas-vendedor
 *   - vendas-produto
 *   - curva-abc
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ type: string }> },
) {
  const { type } = (await params) as { type: ReportType };
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenantId =
    req.cookies.get("x-active-tenant")?.value ?? session.activeTenantId;
  if (!tenantId) {
    return NextResponse.json({ error: "No active tenant" }, { status: 403 });
  }

  const dateFrom = req.nextUrl.searchParams.get("dateFrom") ?? undefined;
  const dateTo = req.nextUrl.searchParams.get("dateTo") ?? undefined;

  const periodSubtitle =
    dateFrom && dateTo ? `Periodo ${fmtDate(dateFrom)} a ${fmtDate(dateTo)}` : undefined;

  const tenant = await withAdmin(async (tx) =>
    tx.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
  );
  const tenantName = tenant?.name ?? "Arena Tech";

  try {
    let title: string;
    let columns: ReportColumn[];
    let rows: Array<Record<string, string | number | null | undefined>>;
    let subtitle = periodSubtitle;

    switch (type) {
      case "posicao-estoque": {
        title = "Posicao de Estoque";
        subtitle = undefined;
        const products = await withTenant(tenantId, async (tx) =>
          tx.product.findMany({
            where: { deletedAt: null, active: true },
            orderBy: { name: "asc" },
            select: {
              name: true,
              sku: true,
              currentStock: true,
              minStock: true,
              costPrice: true,
              salePrice: true,
              category: { select: { name: true } },
            },
          }),
        );
        columns = [
          { key: "name", label: "Produto", width: 3 },
          { key: "sku", label: "SKU", width: 1 },
          { key: "category", label: "Categoria", width: 1.5 },
          { key: "currentStock", label: "Atual", align: "right", width: 0.7 },
          { key: "minStock", label: "Min", align: "right", width: 0.7 },
          { key: "salePrice", label: "Preco venda", align: "right", width: 1.2 },
        ];
        rows = products.map((p) => ({
          name: p.name,
          sku: p.sku ?? "-",
          category: p.category?.name ?? "-",
          currentStock: p.currentStock,
          minStock: p.minStock,
          salePrice: fmtDecimal(p.salePrice),
        }));
        break;
      }

      case "estoque-minimo": {
        title = "Produtos Abaixo do Estoque Minimo";
        subtitle = undefined;
        const products = await withTenant(tenantId, async (tx) => {
          const list = await tx.product.findMany({
            where: { deletedAt: null, active: true },
            orderBy: { name: "asc" },
            select: {
              name: true,
              sku: true,
              currentStock: true,
              minStock: true,
              salePrice: true,
            },
          });
          return list.filter((p) => p.currentStock < p.minStock);
        });
        columns = [
          { key: "name", label: "Produto", width: 3 },
          { key: "sku", label: "SKU", width: 1 },
          { key: "currentStock", label: "Atual", align: "right", width: 0.8 },
          { key: "minStock", label: "Min", align: "right", width: 0.8 },
          { key: "faltante", label: "Faltante", align: "right", width: 0.8 },
          { key: "salePrice", label: "Preco venda", align: "right", width: 1.2 },
        ];
        rows = products.map((p) => ({
          name: p.name,
          sku: p.sku ?? "-",
          currentStock: p.currentStock,
          minStock: p.minStock,
          faltante: p.minStock - p.currentStock,
          salePrice: fmtDecimal(p.salePrice),
        }));
        break;
      }

      case "vendas-periodo": {
        title = "Vendas no Periodo";
        const dFrom = dateFrom ? new Date(dateFrom) : new Date(Date.now() - 30 * 86400000);
        const dTo = dateTo ? new Date(dateTo + "T23:59:59") : new Date();
        const sales = await withTenant(tenantId, async (tx) =>
          tx.sale.findMany({
            where: {
              status: "COMPLETED",
              saleDate: { gte: dFrom, lte: dTo },
            },
            orderBy: { saleDate: "desc" },
            select: {
              number: true,
              saleDate: true,
              customerName: true,
              totalAmount: true,
              paymentDetails: true,
            },
          }),
        );
        columns = [
          { key: "number", label: "Venda", width: 1.2 },
          { key: "saleDate", label: "Data", width: 1 },
          { key: "customer", label: "Cliente", width: 2.5 },
          { key: "total", label: "Total", align: "right", width: 1.2 },
        ];
        rows = sales.map((s) => ({
          number: s.number,
          saleDate: fmtDate(s.saleDate),
          customer: s.customerName ?? "Consumidor final",
          total: fmtDecimal(s.totalAmount),
        }));
        break;
      }

      case "vendas-vendedor": {
        title = "Vendas por Vendedor";
        const dFrom = dateFrom ? new Date(dateFrom) : new Date(Date.now() - 30 * 86400000);
        const dTo = dateTo ? new Date(dateTo + "T23:59:59") : new Date();
        const sales = await withTenant(tenantId, async (tx) =>
          tx.sale.findMany({
            where: { status: "COMPLETED", saleDate: { gte: dFrom, lte: dTo } },
            select: { sellerId: true, totalAmount: true },
          }),
        );
        const agg = new Map<string, { count: number; total: number }>();
        for (const s of sales) {
          const cur = agg.get(s.sellerId) ?? { count: 0, total: 0 };
          cur.count += 1;
          cur.total += Number(s.totalAmount);
          agg.set(s.sellerId, cur);
        }
        const users = await withAdmin(async (tx) =>
          tx.user.findMany({
            where: { id: { in: [...agg.keys()] } },
            select: { id: true, name: true },
          }),
        );
        const userMap = new Map(users.map((u) => [u.id, u.name]));
        const sorted = [...agg.entries()].sort((a, b) => b[1].total - a[1].total);
        columns = [
          { key: "rank", label: "#", align: "right", width: 0.4 },
          { key: "name", label: "Vendedor", width: 3 },
          { key: "count", label: "Vendas", align: "right", width: 0.8 },
          { key: "total", label: "Total", align: "right", width: 1.4 },
        ];
        rows = sorted.map(([sellerId, a], i) => ({
          rank: i + 1,
          name: userMap.get(sellerId) ?? "Desconhecido",
          count: a.count,
          total: "R$ " + a.total.toLocaleString("pt-BR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }),
        }));
        break;
      }

      case "vendas-produto": {
        title = "Vendas por Produto";
        const dFrom = dateFrom ? new Date(dateFrom) : new Date(Date.now() - 30 * 86400000);
        const dTo = dateTo ? new Date(dateTo + "T23:59:59") : new Date();
        const items = await withTenant(tenantId, async (tx) =>
          tx.saleItem.findMany({
            where: {
              sale: { status: "COMPLETED", saleDate: { gte: dFrom, lte: dTo } },
            },
            select: {
              productId: true,
              description: true,
              quantity: true,
              total: true,
            },
          }),
        );
        const agg = new Map<string, { name: string; qty: number; total: number }>();
        for (const it of items) {
          const key = it.productId ?? it.description;
          const cur = agg.get(key) ?? { name: it.description, qty: 0, total: 0 };
          cur.qty += it.quantity;
          cur.total += Number(it.total);
          agg.set(key, cur);
        }
        const sorted = [...agg.values()].sort((a, b) => b.total - a.total);
        columns = [
          { key: "rank", label: "#", align: "right", width: 0.4 },
          { key: "name", label: "Produto", width: 3.5 },
          { key: "qty", label: "Qtd", align: "right", width: 0.8 },
          { key: "total", label: "Total", align: "right", width: 1.4 },
        ];
        rows = sorted.map((p, i) => ({
          rank: i + 1,
          name: p.name,
          qty: p.qty,
          total: "R$ " + p.total.toLocaleString("pt-BR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }),
        }));
        break;
      }

      case "curva-abc": {
        title = "Curva ABC (vendas por produto)";
        const dFrom = dateFrom ? new Date(dateFrom) : new Date(Date.now() - 90 * 86400000);
        const dTo = dateTo ? new Date(dateTo + "T23:59:59") : new Date();
        const items = await withTenant(tenantId, async (tx) =>
          tx.saleItem.findMany({
            where: {
              sale: { status: "COMPLETED", saleDate: { gte: dFrom, lte: dTo } },
            },
            select: {
              productId: true,
              description: true,
              quantity: true,
              total: true,
            },
          }),
        );
        const agg = new Map<string, { name: string; qty: number; total: number }>();
        for (const it of items) {
          const key = it.productId ?? it.description;
          const cur = agg.get(key) ?? { name: it.description, qty: 0, total: 0 };
          cur.qty += it.quantity;
          cur.total += Number(it.total);
          agg.set(key, cur);
        }
        const sorted = [...agg.values()].sort((a, b) => b.total - a.total);
        const grandTotal = sorted.reduce((s, p) => s + p.total, 0);
        let acc = 0;
        columns = [
          { key: "rank", label: "#", align: "right", width: 0.4 },
          { key: "name", label: "Produto", width: 3.5 },
          { key: "qty", label: "Qtd", align: "right", width: 0.6 },
          { key: "total", label: "Faturamento", align: "right", width: 1.4 },
          { key: "pct", label: "% acum.", align: "right", width: 0.9 },
          { key: "abc", label: "Classe", align: "center", width: 0.6 },
        ];
        rows = sorted.map((p, i) => {
          acc += p.total;
          const pctAcc = grandTotal > 0 ? (acc / grandTotal) * 100 : 0;
          const abc = pctAcc <= 80 ? "A" : pctAcc <= 95 ? "B" : "C";
          return {
            rank: i + 1,
            name: p.name,
            qty: p.qty,
            total: "R$ " + p.total.toLocaleString("pt-BR", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }),
            pct: pctAcc.toFixed(1) + "%",
            abc,
          };
        });
        break;
      }

      default:
        return NextResponse.json({ error: "Tipo invalido" }, { status: 400 });
    }

    const doc = StockReportPdf({
      title,
      subtitle,
      tenantName,
      columns,
      rows,
    }) as ReactElement<DocumentProps>;
    const buffer = await renderPdfToBuffer(doc);
    const filename = `${type}-${new Date().toISOString().slice(0, 10)}.pdf`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new NextResponse(buffer as any, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error("Stock report PDF error:", err);
    return NextResponse.json(
      { error: "Erro ao gerar PDF do relatorio" },
      { status: 500 },
    );
  }
}

// Suprime warning: fmtCurrency declarada mas nao usada em todos os branches.
void fmtCurrency;
