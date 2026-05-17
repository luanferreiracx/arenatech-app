import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { withTenant } from "@/server/db";
import { Prisma } from "@prisma/client";

function decimalToCents(v: Prisma.Decimal | null | undefined): number {
  if (v == null) return 0;
  return Math.round(Number(v) * 100);
}

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * GET /api/cashier/report?id={cashSessionId}
 *
 * Generates an HTML page suitable for printing as PDF (Ctrl+P).
 * Requires authenticated user with access to the tenant.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
  }

  const sessionId = req.nextUrl.searchParams.get("id");
  if (!sessionId) {
    return NextResponse.json({ error: "ID do caixa obrigatorio" }, { status: 400 });
  }

  const tenantId = req.cookies.get("x-active-tenant")?.value ?? session.activeTenantId;
  if (!tenantId) {
    return NextResponse.json({ error: "Tenant nao selecionado" }, { status: 403 });
  }

  const result = await withTenant(tenantId, async (tx) => {
    const cashSession = await tx.cashSession.findUnique({
      where: { id: sessionId },
      include: {
        movements: { orderBy: { createdAt: "asc" } },
      },
    });

    if (!cashSession) return null;

    // Resolve user name
    const user = await (tx as unknown as { user: { findUnique: (a: Record<string, unknown>) => Promise<{ name: string } | null> } }).user.findUnique({
      where: { id: cashSession.userId },
      select: { name: true },
    });

    return { cashSession, userName: user?.name ?? "Operador" };
  });

  if (!result) {
    return NextResponse.json({ error: "Caixa nao encontrado" }, { status: 404 });
  }

  const { cashSession, userName } = result;

  // Build summary
  const opening = decimalToCents(cashSession.initialBalance);
  let totalSales = 0;
  let totalSalesCash = 0;
  let totalWithdrawals = 0;
  let totalDeposits = 0;
  let totalExpenses = 0;
  let salesCount = 0;

  const paymentSummary: Record<string, { count: number; total: number }> = {};

  for (const m of cashSession.movements) {
    const amount = decimalToCents(m.amount);
    switch (m.type) {
      case "SALE":
        totalSales += amount;
        salesCount++;
        if (m.paymentMethod === "dinheiro") totalSalesCash += amount;
        {
          const method = m.paymentMethod ?? "outros";
          if (!paymentSummary[method]) paymentSummary[method] = { count: 0, total: 0 };
          paymentSummary[method]!.count++;
          paymentSummary[method]!.total += amount;
        }
        break;
      case "WITHDRAWAL":
        totalWithdrawals += amount;
        break;
      case "DEPOSIT":
        totalDeposits += amount;
        break;
      case "EXPENSE":
        totalExpenses += amount;
        break;
    }
  }

  const expectedCash = opening + totalSalesCash + totalDeposits - totalWithdrawals - totalExpenses;
  const reportedBalance = cashSession.declaredBalance ? decimalToCents(cashSession.declaredBalance) : 0;
  const difference = reportedBalance - expectedCash;

  const methodLabels: Record<string, string> = {
    dinheiro: "Dinheiro",
    pix: "PIX",
    cartao_credito: "Cartao de Credito",
    cartao_debito: "Cartao de Debito",
    crediario: "Crediario",
    boleto: "Boleto",
    transferencia: "Transferencia",
    depix: "DEPIX",
    outros: "Outros",
  };

  const paymentRows = Object.entries(paymentSummary)
    .sort(([, a], [, b]) => b.total - a.total)
    .map(
      ([method, data]) => `
        <tr>
          <td>${methodLabels[method] ?? method}</td>
          <td class="text-center">${data.count}</td>
          <td class="text-right">R$ ${formatCents(data.total)}</td>
        </tr>`,
    )
    .join("");

  const openedAt = cashSession.openedAt
    ? new Date(cashSession.openedAt).toLocaleString("pt-BR")
    : "-";
  const closedAt = cashSession.closedAt
    ? new Date(cashSession.closedAt).toLocaleString("pt-BR")
    : "-";

  const diffClass = difference < 0 ? "danger" : difference > 0 ? "warning" : "success";
  const diffLabel = difference < 0 ? "(FALTA)" : difference > 0 ? "(SOBRA)" : "(CONFERE)";

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Relatorio de Fechamento de Caixa</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    @page { margin: 15mm; size: A4 portrait; }
    body { font-family: 'Inter', Arial, Helvetica, sans-serif; font-size: 10pt; line-height: 1.4; color: #000; }
    .no-print { display: inline-block; margin-bottom: 20px; padding: 8px 16px; background: #c9a55c; color: #000; border: none; cursor: pointer; font-weight: bold; border-radius: 4px; }
    @media print {
      .no-print { display: none !important; }
      thead { display: table-header-group; }
      tr { page-break-inside: avoid; }
    }
    .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 15px; }
    .header h1 { font-size: 14pt; margin-bottom: 3px; letter-spacing: 2px; }
    .header .brand { font-size: 18pt; font-weight: bold; margin-bottom: 5px; }
    .header p { font-size: 9pt; color: #333; }
    .section { margin-bottom: 15px; }
    .section-title { background-color: #f0f0f0; padding: 5px 10px; font-weight: bold; font-size: 11pt; border-bottom: 1px solid #000; margin-bottom: 10px; }
    .info-table { width: 100%; border-collapse: collapse; }
    .info-table td { padding: 5px 10px; vertical-align: top; }
    .info-table .label { color: #666; width: 40%; }
    .info-table .value { font-weight: bold; }
    .data-table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
    .data-table th, .data-table td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; }
    .data-table th { background-color: #f5f5f5; font-weight: bold; }
    .text-right { text-align: right; }
    .text-center { text-align: center; }
    .data-table tfoot td { font-weight: bold; background-color: #f5f5f5; }
    .text-success { color: #28a745; }
    .text-danger { color: #dc3545; }
    .highlight-box { border: 2px solid #000; padding: 10px; margin-top: 10px; }
    .highlight-box.success { border-color: #28a745; background-color: #d4edda; }
    .highlight-box.warning { border-color: #ffc107; background-color: #fff3cd; }
    .highlight-box.danger { border-color: #dc3545; background-color: #f8d7da; }
    .total-row { font-size: 12pt; }
    .divider { border-top: 1px dashed #999; margin: 15px 0; }
    .signature-area { margin-top: 40px; page-break-inside: avoid; }
    .signature-line { border-top: 1px solid #000; margin: 40px 0 5px 0; width: 60%; }
    .signature-label { font-size: 9pt; color: #333; }
    .footer { margin-top: 30px; text-align: center; font-size: 8pt; color: #666; padding-top: 10px; border-top: 1px solid #ddd; }
  </style>
</head>
<body>
  <button class="no-print" onclick="window.print()">Imprimir (Ctrl+P)</button>

  <div class="header">
    <div class="brand">ARENA·TECH</div>
    <h1>RELATORIO DE FECHAMENTO DE CAIXA</h1>
    <p>${new Date(cashSession.openedAt).toLocaleDateString("pt-BR")}</p>
  </div>

  <div class="section">
    <div class="section-title">INFORMACOES DO CAIXA</div>
    <table class="info-table">
      <tr>
        <td class="label">Operador:</td>
        <td class="value">${userName}</td>
        <td class="label">Abertura:</td>
        <td class="value">${openedAt}</td>
      </tr>
      <tr>
        <td class="label">Fechamento:</td>
        <td class="value">${closedAt}</td>
        <td></td><td></td>
      </tr>
    </table>
  </div>

  <div class="divider"></div>

  <div class="section">
    <div class="section-title">RESUMO DE VENDAS</div>
    <table class="info-table">
      <tr>
        <td class="label">Quantidade de Vendas:</td>
        <td class="value">${salesCount}</td>
        <td class="label">Total de Vendas:</td>
        <td class="value text-success">R$ ${formatCents(totalSales)}</td>
      </tr>
    </table>

    <h4 style="margin: 15px 0 10px;">Por Forma de Pagamento</h4>
    <table class="data-table">
      <thead>
        <tr><th>Forma de Pagamento</th><th class="text-center">Quantidade</th><th class="text-right">Total</th></tr>
      </thead>
      <tbody>
        ${paymentRows || '<tr><td colspan="3" class="text-center">Nenhuma venda registrada</td></tr>'}
      </tbody>
      <tfoot>
        <tr><td colspan="2">TOTAL</td><td class="text-right">R$ ${formatCents(totalSales)}</td></tr>
      </tfoot>
    </table>
  </div>

  <div class="divider"></div>

  <div class="section">
    <div class="section-title">MOVIMENTACOES DE CAIXA</div>
    <table class="data-table">
      <tbody>
        <tr><td>Saldo Inicial</td><td class="text-right">R$ ${formatCents(opening)}</td></tr>
        <tr><td class="text-success">(+) Entradas Dinheiro</td><td class="text-right text-success">R$ ${formatCents(totalSalesCash)}</td></tr>
        <tr><td class="text-success">(+) Suprimentos</td><td class="text-right text-success">R$ ${formatCents(totalDeposits)}</td></tr>
        <tr><td class="text-danger">(-) Sangrias</td><td class="text-right text-danger">R$ ${formatCents(totalWithdrawals)}</td></tr>
        <tr><td class="text-danger">(-) Despesas</td><td class="text-right text-danger">R$ ${formatCents(totalExpenses)}</td></tr>
      </tbody>
      <tfoot>
        <tr class="total-row"><td><strong>SALDO ESPERADO (DINHEIRO)</strong></td><td class="text-right"><strong>R$ ${formatCents(expectedCash)}</strong></td></tr>
      </tfoot>
    </table>
  </div>

  <div class="divider"></div>

  <div class="section">
    <div class="section-title">CONFERENCIA</div>
    <div class="highlight-box ${diffClass}">
      <table class="info-table">
        <tr><td class="label">Saldo Sistema:</td><td class="value">R$ ${formatCents(expectedCash)}</td></tr>
        <tr><td class="label">Saldo Informado:</td><td class="value">R$ ${formatCents(reportedBalance)}</td></tr>
        <tr><td class="label">Diferenca:</td><td class="value ${difference < 0 ? "text-danger" : difference > 0 ? "text-success" : ""}">R$ ${formatCents(difference)} ${diffLabel}</td></tr>
      </table>
    </div>
    ${cashSession.closingNote ? `<div style="margin-top:15px;padding:10px;background:#f9f9f9;border:1px solid #ddd;"><strong>Observacao:</strong><br>${cashSession.closingNote}</div>` : ""}
  </div>

  <div class="signature-area">
    <div class="signature-line"></div>
    <p class="signature-label">Conferido por: ____________________</p>
    <div class="signature-line" style="margin-top: 30px;"></div>
    <p class="signature-label">Data: ____/____ /________</p>
    <div class="signature-line" style="margin-top: 30px;"></div>
    <p class="signature-label">Assinatura: ____________________</p>
  </div>

  <div class="footer">
    Documento gerado em ${new Date().toLocaleString("pt-BR")} | Sistema Arena Tech
  </div>
</body>
</html>`;

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}
