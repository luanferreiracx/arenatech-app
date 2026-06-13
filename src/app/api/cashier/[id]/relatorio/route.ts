import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { auth } from "@/server/auth";
import { resolveActiveTenant } from "@/lib/auth/active-tenant";
import { withTenant, withAdmin } from "@/server/db";
import { formatCnpj } from "@/lib/utils";
import { PAYMENT_METHOD_LABELS } from "@/lib/validators/cashier";

/**
 * GET /api/cashier/[id]/relatorio
 *
 * Relatorio HTML/PDF de fechamento de caixa. Paridade Laravel
 * `CaixaController::relatorioPdf` + `gerarRelatorioFechamento`.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cookies = _req.cookies;
  const tenantId = resolveActiveTenant(session, cookies.get("x-active-tenant")?.value)?.id;
  if (!tenantId) {
    return NextResponse.json({ error: "No active tenant" }, { status: 403 });
  }

  try {
    const cashSession = await withTenant(tenantId, async (tx) => {
      return tx.cashSession.findUnique({
        where: { id },
        include: {
          movements: { orderBy: { createdAt: "asc" } },
        },
      });
    });

    if (!cashSession) {
      return NextResponse.json({ error: "Caixa nao encontrado" }, { status: 404 });
    }

    const [tenant, settings, userInfo] = await Promise.all([
      withAdmin(async (tx) =>
        tx.tenant.findUnique({ where: { id: tenantId }, select: { name: true, cnpj: true } }),
      ),
      withTenant(tenantId, async (tx) =>
        tx.tenantSettings.findUnique({
          where: { tenantId },
          select: { tradeName: true, cnpj: true, phone: true, logoUrl: true },
        }),
      ),
      withAdmin(async (tx) =>
        tx.user.findUnique({
          where: { id: cashSession.userId },
          select: { name: true },
        }),
      ),
    ]);

    const nomeLoja = settings?.tradeName ?? tenant?.name ?? "Arena Tech";
    const cnpjLoja = formatCnpj(settings?.cnpj ?? tenant?.cnpj ?? "");

    const esc = (s: string | null | undefined) =>
      (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    const fmt = (v: unknown) => {
      const num = Number(v ?? 0);
      return "R$ " + num.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    const fmtDate = (d: Date | null | undefined) =>
      d ? new Date(d).toLocaleString("pt-BR") : "—";

    // ── Agregacoes ──
    const movements = cashSession.movements;
    let totalSales = 0;
    let totalDeposits = 0;
    let totalWithdrawals = 0;
    let totalExpenses = 0;
    const byPaymentMethod = new Map<string, { income: number; outcome: number; count: number }>();

    for (const m of movements) {
      const amt = Number(m.amount);
      const signed = m.nature === "INCOME" ? amt : -amt;
      if (m.type === "SALE") totalSales += signed;
      if (m.type === "DEPOSIT") totalDeposits += signed;
      if (m.type === "WITHDRAWAL") totalWithdrawals += signed;
      if (m.type === "EXPENSE") totalExpenses += signed;

      const method = m.paymentMethod ?? "outros";
      const entry = byPaymentMethod.get(method) ?? { income: 0, outcome: 0, count: 0 };
      if (m.nature === "INCOME") entry.income += amt;
      else entry.outcome += amt;
      entry.count++;
      byPaymentMethod.set(method, entry);
    }

    const initialBalance = Number(cashSession.initialBalance);
    const calculatedBalance = Number(cashSession.calculatedBalance ?? 0);
    const declaredBalance = Number(cashSession.declaredBalance ?? 0);
    const difference = Number(cashSession.difference ?? 0);

    const paymentMethodsRows = Array.from(byPaymentMethod.entries())
      .sort((a, b) => b[1].income - a[1].income)
      .map(([method, data]) => {
        const label = PAYMENT_METHOD_LABELS[method] ?? method;
        return `<tr>
          <td>${esc(label)}</td>
          <td style="text-align: right;">${fmt(data.income)}</td>
          <td style="text-align: right;">${fmt(data.outcome)}</td>
          <td style="text-align: right;">${fmt(data.income - data.outcome)}</td>
          <td style="text-align: center; color: #666;">${data.count}</td>
        </tr>`;
      })
      .join("");

    const movementsRows = movements
      .map(
        (m) => `<tr>
          <td style="font-size: 8pt;">${fmtDate(m.createdAt)}</td>
          <td>${esc(m.type)}</td>
          <td>${esc(PAYMENT_METHOD_LABELS[m.paymentMethod ?? ""] ?? m.paymentMethod ?? "—")}</td>
          <td style="text-align: right; ${m.nature === "OUTCOME" ? "color: #b00;" : ""}">
            ${m.nature === "OUTCOME" ? "-" : ""}${fmt(m.amount)}
          </td>
          <td style="font-size: 8pt;">${esc(m.description)}</td>
        </tr>`,
      )
      .join("");

    const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<title>Relatorio Caixa ${esc(id.slice(0, 8))}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 9pt; color: #000; line-height: 1.3; margin: 12mm; }
  .header { border-bottom: 2px solid #2ec4b6; padding-bottom: 10px; margin-bottom: 14px; }
  .title { font-size: 14pt; font-weight: bold; text-align: center; margin: 16px 0; }
  .meta { display: flex; justify-content: space-between; font-size: 9pt; margin-bottom: 12px; }
  .meta-item { display: flex; flex-direction: column; }
  .meta-label { font-size: 7pt; color: #888; text-transform: uppercase; }
  .meta-value { font-weight: bold; }
  .section { margin: 14px 0; }
  .section-title { font-size: 10pt; font-weight: bold; color: #2ec4b6; border-bottom: 1px solid #ddd; padding-bottom: 3px; margin-bottom: 6px; }
  .summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .summary-card { border: 1px solid #ddd; padding: 8px; border-radius: 4px; }
  .summary-card .label { font-size: 7pt; color: #888; text-transform: uppercase; }
  .summary-card .value { font-size: 11pt; font-weight: bold; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; font-size: 8.5pt; }
  table th { background: #f5f5f5; padding: 5px; text-align: left; border-bottom: 1px solid #ccc; font-size: 8pt; }
  table td { padding: 4px 5px; border-bottom: 1px solid #eee; }
  .diff-box { padding: 8px; border-radius: 6px; text-align: center; margin: 10px 0; }
  .diff-zero { background: #e8f5e9; border: 1px solid #4caf50; }
  .diff-pos { background: #e3f2fd; border: 1px solid #2196f3; }
  .diff-neg { background: #ffebee; border: 1px solid #f44336; }
  .footer { margin-top: 20px; font-size: 7pt; color: #888; text-align: center; }
</style>
</head><body>
  <div class="header">
    <table style="width: 100%; border: none;"><tr>
      ${settings?.logoUrl ? `<td style="vertical-align: middle; width: 80px;"><img src="${esc(settings.logoUrl)}" alt="Logo" style="max-height: 45px; max-width: 75px;"></td>` : ""}
      <td style="vertical-align: middle;">
        <div style="font-size: 12pt; font-weight: bold;">${esc(nomeLoja)}</div>
        ${cnpjLoja ? `<div style="font-size: 8pt; color: #666;">${esc(cnpjLoja)}</div>` : ""}
      </td>
    </tr></table>
  </div>

  <div class="title">RELATORIO DE FECHAMENTO DE CAIXA</div>

  <div class="meta">
    <div class="meta-item">
      <span class="meta-label">Operador</span>
      <span class="meta-value">${esc(userInfo?.name ?? "—")}</span>
    </div>
    <div class="meta-item">
      <span class="meta-label">Aberto em</span>
      <span class="meta-value">${fmtDate(cashSession.openedAt)}</span>
    </div>
    <div class="meta-item">
      <span class="meta-label">Fechado em</span>
      <span class="meta-value">${fmtDate(cashSession.closedAt)}</span>
    </div>
  </div>

  <div class="section">
    <div class="section-title">RESUMO POR TIPO</div>
    <div class="summary-grid">
      <div class="summary-card"><div class="label">Saldo Inicial</div><div class="value">${fmt(initialBalance)}</div></div>
      <div class="summary-card"><div class="label">Vendas</div><div class="value" style="color: #2e7d32;">${fmt(totalSales)}</div></div>
      <div class="summary-card"><div class="label">Suprimentos</div><div class="value" style="color: #2e7d32;">${fmt(totalDeposits)}</div></div>
      <div class="summary-card"><div class="label">Sangrias</div><div class="value" style="color: #b00;">${fmt(totalWithdrawals)}</div></div>
      <div class="summary-card"><div class="label">Despesas</div><div class="value" style="color: #b00;">${fmt(totalExpenses)}</div></div>
      <div class="summary-card"><div class="label">Saldo Calculado</div><div class="value">${fmt(calculatedBalance)}</div></div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">RESUMO POR FORMA DE PAGAMENTO</div>
    <table>
      <thead>
        <tr>
          <th>Forma</th>
          <th style="text-align: right;">Entradas</th>
          <th style="text-align: right;">Saidas</th>
          <th style="text-align: right;">Saldo</th>
          <th style="text-align: center;">Qtd</th>
        </tr>
      </thead>
      <tbody>${paymentMethodsRows || '<tr><td colspan="5" style="text-align: center; color: #888;">Nenhuma movimentacao</td></tr>'}</tbody>
    </table>
  </div>

  <div class="section">
    <div class="section-title">CONFERENCIA</div>
    <div class="summary-grid">
      <div class="summary-card"><div class="label">Calculado (sistema)</div><div class="value">${fmt(calculatedBalance)}</div></div>
      <div class="summary-card"><div class="label">Declarado (operador)</div><div class="value">${fmt(declaredBalance)}</div></div>
      <div class="summary-card">
        <div class="label">Diferenca</div>
        <div class="value" style="color: ${difference === 0 ? "#2e7d32" : difference > 0 ? "#1976d2" : "#b00"};">
          ${difference >= 0 ? "+" : ""}${fmt(difference)}
        </div>
      </div>
    </div>
    <div class="diff-box ${difference === 0 ? "diff-zero" : difference > 0 ? "diff-pos" : "diff-neg"}">
      ${difference === 0 ? "Conferencia: OK (sem diferenca)" : difference > 0 ? "Sobra de caixa" : "Falta de caixa"}
    </div>
  </div>

  ${
    movements.length > 0
      ? `<div class="section">
    <div class="section-title">MOVIMENTACOES</div>
    <table>
      <thead>
        <tr>
          <th style="width: 80px;">Data</th>
          <th style="width: 70px;">Tipo</th>
          <th style="width: 80px;">Forma</th>
          <th style="text-align: right; width: 80px;">Valor</th>
          <th>Descricao</th>
        </tr>
      </thead>
      <tbody>${movementsRows}</tbody>
    </table>
  </div>`
      : ""
  }

  ${cashSession.openingNote ? `<div class="section"><div class="section-title">OBSERVACAO DE ABERTURA</div><div>${esc(cashSession.openingNote)}</div></div>` : ""}
  ${cashSession.closingNote ? `<div class="section"><div class="section-title">OBSERVACAO DE FECHAMENTO</div><div>${esc(cashSession.closingNote)}</div></div>` : ""}

  <div class="footer">
    Documento gerado em ${new Date().toLocaleString("pt-BR")} — ${esc(nomeLoja)}
  </div>
</body></html>`;

    return new NextResponse(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (err) {
    logger.error("Cashier report PDF error:", { err: String(err) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
