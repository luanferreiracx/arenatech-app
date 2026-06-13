import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { resolveActiveTenant } from "@/lib/auth/active-tenant";
import { withTenant, withAdmin } from "@/server/db";

/**
 * GET /api/reports/{type}/pdf?from=...&to=...&extra=...
 *
 * Endpoint generico de relatorios em formato HTML/PDF (imprimivel via navegador).
 * Cliente abre em nova aba e usa Ctrl+P para gerar PDF.
 *
 * Tipos suportados:
 *   - commission           — Comissoes do mes
 *   - stock-position       — Posicao de estoque
 *   - nf                   — Auditoria NF (vendas + OS)
 *   - technician           — Desempenho por tecnico
 *
 * Paridade Laravel `Barryvdh\DomPDF` em `RelatorioController::*Pdf`.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ type: string }> },
) {
  const { type } = await params;
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenantId = resolveActiveTenant(session, req.cookies.get("x-active-tenant")?.value)?.id;
  if (!tenantId) {
    return NextResponse.json({ error: "No active tenant" }, { status: 403 });
  }

  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const dateFrom = from ? new Date(from) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const dateTo = to ? new Date(to) : new Date();

  let title = "Relatorio";
  let body = "";

  try {
    switch (type) {
      case "commission":
        title = "Relatorio de Comissoes";
        body = await renderCommissionReport(tenantId, dateFrom, dateTo);
        break;
      case "stock-position":
        title = "Relatorio de Posicao de Estoque";
        body = await renderStockPositionReport(tenantId);
        break;
      case "nf":
        title = "Relatorio de Notas Fiscais";
        body = await renderNfReport(tenantId, dateFrom, dateTo);
        break;
      case "technician":
        title = "Relatorio de Desempenho por Tecnico";
        body = await renderTechnicianReport(tenantId, dateFrom, dateTo);
        break;
      default:
        return NextResponse.json({ error: `Unknown report type: ${type}` }, { status: 400 });
    }

    const tenantName = await withTenant(tenantId, async (tx) => {
      const s = await tx.tenantSettings.findUnique({
        where: { tenantId },
        select: { tradeName: true, legalName: true },
      });
      return s?.tradeName ?? s?.legalName ?? "Arena Tech";
    });

    const html = layout(title, tenantName, dateFrom, dateTo, body);

    return new NextResponse(html, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 },
    );
  }
}

function layout(title: string, tenant: string, from: Date, to: Date, body: string): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>${escape(title)} — ${escape(tenant)}</title>
  <style>
    @page { size: A4; margin: 16mm; }
    body { font-family: Helvetica, Arial, sans-serif; color: #111; font-size: 12px; }
    h1 { font-size: 18px; margin: 0 0 4px; }
    .meta { color: #666; font-size: 11px; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; }
    th { background: #f3f4f6; }
    tr:nth-child(even) td { background: #fafafa; }
    .right { text-align: right; }
    .total { font-weight: bold; background: #fef3c7 !important; }
    .footer { margin-top: 24px; font-size: 10px; color: #888; text-align: right; }
  </style>
</head>
<body>
  <h1>${escape(title)}</h1>
  <div class="meta">
    <strong>${escape(tenant)}</strong><br>
    Periodo: ${formatDate(from)} a ${formatDate(to)}<br>
    Gerado em: ${formatDate(new Date(), true)}
  </div>
  ${body}
  <div class="footer">Arena Tech — relatorio gerado automaticamente</div>
</body>
</html>`;
}

async function renderCommissionReport(tenantId: string, from: Date, to: Date): Promise<string> {
  const year = from.getFullYear();
  const month = from.getMonth() + 1;
  const commissions = await withTenant(tenantId, async (tx) => {
    return tx.commission.findMany({
      where: { periodYear: year, periodMonth: month },
      orderBy: [{ userId: "asc" }, { createdAt: "asc" }],
    });
  });

  if (commissions.length === 0) {
    return `<p>Nenhuma comissao encontrada no periodo.</p>`;
  }

  const userIds = Array.from(new Set(commissions.map((c) => c.userId)));
  const users = await withAdmin(async (tx) =>
    tx.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }),
  );
  const userName = new Map(users.map((u) => [u.id, u.name]));

  type Row = { user: string; type: string; ref: string; base: number; rate: number; amount: number };
  const rows: Row[] = commissions.map((c) => ({
    user: userName.get(c.userId) ?? c.userId.slice(0, 8),
    type: c.type,
    ref: `${c.referenceType}#${c.referenceNumber}`,
    base: Number(c.baseAmount),
    rate: Number(c.ratePercent),
    amount: Number(c.commissionAmount),
  }));

  const totalCommission = rows.reduce((sum, r) => sum + r.amount, 0);

  let html = `<table>
    <thead><tr>
      <th>Usuario</th><th>Tipo</th><th>Referencia</th>
      <th class="right">Base</th><th class="right">Taxa %</th><th class="right">Comissao</th>
    </tr></thead>
    <tbody>`;
  for (const r of rows) {
    html += `<tr>
      <td>${escape(r.user)}</td>
      <td>${escape(r.type)}</td>
      <td>${escape(r.ref)}</td>
      <td class="right">${formatBrl(r.base)}</td>
      <td class="right">${r.rate.toFixed(2)}%</td>
      <td class="right">${formatBrl(r.amount)}</td>
    </tr>`;
  }
  html += `<tr class="total"><td colspan="5">Total Geral</td><td class="right">${formatBrl(totalCommission)}</td></tr>
    </tbody></table>`;
  return html;
}

async function renderStockPositionReport(tenantId: string): Promise<string> {
  const products = await withTenant(tenantId, async (tx) => {
    return tx.product.findMany({
      where: { active: true, deletedAt: null },
      select: { id: true, name: true, sku: true, currentStock: true, minStock: true, costPrice: true, salePrice: true },
      orderBy: { name: "asc" },
      take: 1000,
    });
  });

  if (products.length === 0) return `<p>Nenhum produto ativo encontrado.</p>`;

  let html = `<table>
    <thead><tr>
      <th>SKU</th><th>Produto</th>
      <th class="right">Estoque</th><th class="right">Min</th>
      <th class="right">Custo</th><th class="right">Venda</th>
    </tr></thead><tbody>`;
  let totalCost = 0;
  let totalSale = 0;
  for (const p of products) {
    const cost = Number(p.costPrice) * p.currentStock;
    const sale = Number(p.salePrice) * p.currentStock;
    totalCost += cost;
    totalSale += sale;
    html += `<tr>
      <td>${escape(p.sku ?? "—")}</td>
      <td>${escape(p.name)}</td>
      <td class="right">${p.currentStock}</td>
      <td class="right">${p.minStock}</td>
      <td class="right">${formatBrl(Number(p.costPrice))}</td>
      <td class="right">${formatBrl(Number(p.salePrice))}</td>
    </tr>`;
  }
  html += `<tr class="total"><td colspan="4">Total imobilizado</td>
    <td class="right">${formatBrl(totalCost)}</td>
    <td class="right">${formatBrl(totalSale)}</td>
  </tr></tbody></table>`;
  return html;
}

async function renderNfReport(tenantId: string, from: Date, to: Date): Promise<string> {
  const invoices = await withTenant(tenantId, async (tx) => {
    return tx.invoice.findMany({
      where: { createdAt: { gte: from, lte: to }, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 1000,
    });
  });

  if (invoices.length === 0) return `<p>Nenhuma nota fiscal no periodo.</p>`;

  let html = `<table>
    <thead><tr>
      <th>Tipo</th><th>Numero</th><th>Status</th><th>Destinatario</th>
      <th class="right">Total</th><th>Emitida</th>
    </tr></thead><tbody>`;
  let total = 0;
  for (const inv of invoices) {
    total += Number(inv.totalAmount);
    html += `<tr>
      <td>${escape(inv.type)}</td>
      <td>${inv.number ?? "—"}</td>
      <td>${escape(inv.status)}</td>
      <td>${escape(inv.recipientName ?? "—")}</td>
      <td class="right">${formatBrl(Number(inv.totalAmount))}</td>
      <td>${inv.authorizedAt ? formatDate(inv.authorizedAt) : "—"}</td>
    </tr>`;
  }
  html += `<tr class="total"><td colspan="4">Total</td>
    <td class="right">${formatBrl(total)}</td><td></td></tr></tbody></table>`;
  return html;
}

async function renderTechnicianReport(tenantId: string, from: Date, to: Date): Promise<string> {
  const orders = await withTenant(tenantId, async (tx) => {
    return tx.serviceOrder.findMany({
      where: {
        createdAt: { gte: from, lte: to },
        technicianId: { not: null },
        deletedAt: null,
      },
      select: { technicianId: true, status: true, totalAmount: true, partsCost: true },
    });
  });

  if (orders.length === 0) return `<p>Nenhuma OS com tecnico no periodo.</p>`;

  type Agg = { count: number; total: number; cost: number; completed: number };
  const byTech = new Map<string, Agg>();
  for (const o of orders) {
    if (!o.technicianId) continue;
    const agg = byTech.get(o.technicianId) ?? { count: 0, total: 0, cost: 0, completed: 0 };
    agg.count++;
    agg.total += Number(o.totalAmount);
    agg.cost += Number(o.partsCost);
    if (["COMPLETED", "PAID", "READY_FOR_PICKUP", "DELIVERED"].includes(o.status)) agg.completed++;
    byTech.set(o.technicianId, agg);
  }

  const userIds = Array.from(byTech.keys());
  const users = await withAdmin(async (tx) =>
    tx.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }),
  );
  const userName = new Map(users.map((u) => [u.id, u.name]));

  let html = `<table>
    <thead><tr>
      <th>Tecnico</th>
      <th class="right">OS</th><th class="right">Concluidas</th>
      <th class="right">Faturamento</th><th class="right">Custo Pecas</th><th class="right">Lucro</th>
    </tr></thead><tbody>`;
  let totalCount = 0, totalRev = 0, totalCost = 0;
  for (const [techId, agg] of byTech.entries()) {
    const profit = agg.total - agg.cost;
    totalCount += agg.count;
    totalRev += agg.total;
    totalCost += agg.cost;
    html += `<tr>
      <td>${escape(userName.get(techId) ?? techId.slice(0, 8))}</td>
      <td class="right">${agg.count}</td>
      <td class="right">${agg.completed}</td>
      <td class="right">${formatBrl(agg.total)}</td>
      <td class="right">${formatBrl(agg.cost)}</td>
      <td class="right">${formatBrl(profit)}</td>
    </tr>`;
  }
  html += `<tr class="total">
    <td>Total</td>
    <td class="right">${totalCount}</td>
    <td class="right">—</td>
    <td class="right">${formatBrl(totalRev)}</td>
    <td class="right">${formatBrl(totalCost)}</td>
    <td class="right">${formatBrl(totalRev - totalCost)}</td>
  </tr></tbody></table>`;
  return html;
}

function formatBrl(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(date: Date, withTime: boolean = false): string {
  const d = new Date(date);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  if (!withTime) return `${dd}/${mm}/${yyyy}`;
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
}

function escape(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
