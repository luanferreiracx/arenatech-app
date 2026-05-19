import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { withTenant, withAdmin } from "@/server/db";
import { formatCpf } from "@/lib/utils";

/**
 * GET /api/service-orders/[id]/quote-pdf
 *
 * Generates quote (orcamento adicional) PDF.
 * Shows previous vs new values, reason, and approval info.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cookies = _req.cookies;
  const tenantId = cookies.get("x-active-tenant")?.value ?? session.activeTenantId;

  if (!tenantId) {
    return NextResponse.json({ error: "No active tenant" }, { status: 403 });
  }

  try {
    const order = await withTenant(tenantId, async (tx) => {
      return tx.serviceOrder.findUnique({
        where: { id },
        include: {
          quotes: { orderBy: { createdAt: "desc" }, take: 1 },
          items: { orderBy: { createdAt: "asc" } },
        },
      });
    });

    if (!order || order.deletedAt) {
      return NextResponse.json({ error: "OS not found" }, { status: 404 });
    }

    const quote = order.quotes[0];
    if (!quote) {
      return NextResponse.json({ error: "No quote found" }, { status: 404 });
    }

    const customer = await withTenant(tenantId, async (tx) => {
      return tx.customer.findUnique({
        where: { id: order.customerId },
        select: { name: true, cpf: true, phone: true },
      });
    });

    const [tenant, settings] = await Promise.all([
      withAdmin(async (tx) => tx.tenant.findUnique({
        where: { id: tenantId },
        select: { name: true },
      })),
      withTenant(tenantId, async (tx) => tx.tenantSettings.findUnique({
        where: { tenantId },
        select: { tradeName: true, phone: true, logoUrl: true },
      })),
    ]);

    const nomeLoja = settings?.tradeName ?? tenant?.name ?? "ARENA TECH";
    const telefoneLoja = settings?.phone ?? "";

    const fmt = (v: unknown) => {
      const num = Number(v ?? 0);
      return "R$ " + num.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    const fmtDate = (d: Date | null) => {
      if (!d) return "-";
      return new Date(d).toLocaleDateString("pt-BR");
    };

    const esc = (s: string | null | undefined) =>
      (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const approvalLink = `${appUrl}/quote/${quote.approvalLink}`;

    // Items table
    let itemsHtml = "";
    if (order.items.length > 0) {
      itemsHtml = `<table class="items"><thead><tr>
        <th style="text-align: left;">Item</th>
        <th style="text-align: center; width: 50px;">Qtd</th>
        <th style="text-align: right; width: 80px;">Valor</th>
      </tr></thead><tbody>`;
      for (const item of order.items) {
        itemsHtml += `<tr>
          <td>${esc(item.description)}</td>
          <td style="text-align: center;">${Math.round(Number(item.quantity))}</td>
          <td style="text-align: right;">${fmt(item.total)}</td>
        </tr>`;
      }
      itemsHtml += "</tbody></table>";
    }

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8" /><style>
  @page { size: A4; margin: 15mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 10pt; color: #333; line-height: 1.3; }
  .header { text-align: center; margin-bottom: 15px; border-bottom: 3px solid #6f42c1; padding-bottom: 10px; }
  .header h1 { font-size: 16pt; color: #6f42c1; margin-bottom: 3px; }
  .header h2 { font-size: 12pt; color: #555; }
  .section { margin-bottom: 12px; }
  .section-title { font-size: 10pt; font-weight: bold; color: #6f42c1; border-bottom: 1px solid #6f42c1; padding-bottom: 3px; margin-bottom: 6px; }
  .row { display: flex; justify-content: space-between; margin-bottom: 3px; }
  .label { color: #666; font-size: 9pt; }
  .value { font-weight: bold; }
  table.items { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
  table.items th { background: #6f42c1; color: white; padding: 5px; font-size: 9pt; }
  table.items td { padding: 4px 5px; border-bottom: 1px solid #eee; font-size: 9pt; }
  .comparison { display: table; width: 100%; margin-bottom: 10px; }
  .comparison .col { display: table-cell; width: 50%; padding: 8px; vertical-align: top; }
  .comparison .col.previous { background: #f8f9fa; border: 1px solid #dee2e6; }
  .comparison .col.new { background: #f3e8ff; border: 1px solid #6f42c1; }
  .comparison .col h3 { font-size: 10pt; margin-bottom: 6px; }
  .total-new { font-size: 14pt; color: #6f42c1; font-weight: bold; text-align: center; margin: 10px 0; padding: 10px; background: #f3e8ff; border-radius: 6px; }
  .reason { background: #fff3cd; padding: 8px; border-radius: 4px; margin-bottom: 10px; }
  .approval-link { text-align: center; margin: 15px 0; padding: 10px; background: #d4edda; border-radius: 6px; }
  .approval-link a { color: #155724; font-weight: bold; font-size: 11pt; text-decoration: none; }
  .footer { text-align: center; font-size: 8pt; color: #999; margin-top: 15px; border-top: 1px solid #ddd; padding-top: 8px; }
</style></head>
<body>
  <div class="header">
    ${settings?.logoUrl ? `<img src="${esc(settings.logoUrl)}" alt="Logo" style="max-height: 50px; max-width: 180px; margin-bottom: 6px;">` : ""}
    <h1>${esc(nomeLoja)}</h1>
    <h2>ORCAMENTO - OS #${esc(order.number)}</h2>
    ${telefoneLoja ? `<p style="font-size: 9pt; color: #666;">${esc(telefoneLoja)}</p>` : ""}
  </div>

  <div class="section">
    <div class="section-title">DADOS DO CLIENTE</div>
    <div class="row"><span class="label">Cliente:</span> <span class="value">${esc(customer?.name)}</span></div>
    ${customer?.cpf ? `<div class="row"><span class="label">CPF:</span> <span>${esc(formatCpf(customer.cpf))}</span></div>` : ""}
    ${customer?.phone ? `<div class="row"><span class="label">Telefone:</span> <span>${esc(customer.phone)}</span></div>` : ""}
  </div>

  <div class="section">
    <div class="section-title">EQUIPAMENTO</div>
    <div class="row"><span class="label">Tipo:</span> <span>${esc(order.deviceType)}</span></div>
    <div class="row"><span class="label">Modelo:</span> <span>${esc(order.deviceModel)}</span></div>
    ${order.imei ? `<div class="row"><span class="label">IMEI:</span> <span>${esc(order.imei)}</span></div>` : ""}
  </div>

  ${itemsHtml ? `
  <div class="section">
    <div class="section-title">SERVICOS JA APROVADOS (orcamento original)</div>
    <div style="background: #e8f5e9; border: 2px solid #28a745; border-radius: 6px; padding: 10px;">
      ${itemsHtml}
      <div class="row" style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #28a745;">
        <span class="value">Total ja aprovado:</span>
        <span class="value">${fmt(quote.previousTotal)}</span>
      </div>
    </div>
  </div>` : ""}

  <div class="section">
    <div class="section-title">SERVICOS ADICIONAIS — AGUARDANDO APROVACAO</div>
    <div style="background: #fff3cd; border: 2px solid #ffc107; border-radius: 6px; padding: 10px;">
      <div class="reason"><strong>Motivo:</strong> ${esc(quote.reason)}</div>
      ${quote.additionalServices ? `<p style="font-size: 9pt; margin-top: 4px;"><strong>Detalhes:</strong> ${esc(quote.additionalServices)}</p>` : ""}
      <div class="comparison" style="margin-top: 10px;">
        <div class="col previous">
          <h3>Valores Anteriores</h3>
          <div class="row"><span class="label">Servicos:</span> <span>${fmt(quote.previousServiceAmount)}</span></div>
          <div class="row"><span class="label">Pecas:</span> <span>${fmt(quote.previousPartsAmount)}</span></div>
          <div class="row"><span class="label">Desconto:</span> <span>${fmt(quote.previousDiscount)}</span></div>
          <div class="row"><span class="label">Total:</span> <span class="value">${fmt(quote.previousTotal)}</span></div>
        </div>
        <div class="col new">
          <h3>Novos Valores</h3>
          <div class="row"><span class="label">Servicos:</span> <span>${fmt(quote.newServiceAmount)}</span></div>
          <div class="row"><span class="label">Pecas:</span> <span>${fmt(quote.newPartsAmount)}</span></div>
          <div class="row"><span class="label">Desconto:</span> <span>${fmt(quote.newDiscount)}</span></div>
          <div class="row"><span class="label">Total:</span> <span class="value">${fmt(quote.newTotal)}</span></div>
        </div>
      </div>
      <div class="total-new">NOVO VALOR TOTAL: ${fmt(quote.newTotal)}</div>
    </div>
  </div>

  ${quote.status === "approved" ? `
  <div class="section">
    <div style="background: #d4edda; border: 2px solid #28a745; border-radius: 6px; padding: 12px; text-align: center;">
      <p style="font-weight: bold; font-size: 11pt; color: #155724; margin-bottom: 6px;">APROVADO</p>
      <p style="font-style: italic; font-size: 10pt;">
        Eu, ${esc(customer?.name)}, portador(a) do CPF ${esc(formatCpf(customer?.cpf))},
        APROVO os servicos adicionais descritos acima e autorizo o prosseguimento
        no novo valor total de ${fmt(quote.newTotal)}.
      </p>
      ${quote.approvedAt ? `<p style="font-size: 9pt; color: #155724; margin-top: 6px;">Aprovado em: ${fmtDate(quote.approvedAt)}</p>` : ""}
    </div>
  </div>` : ""}

  ${quote.status === "rejected" ? `
  <div class="section">
    <div style="background: #f8d7da; border: 2px solid #dc3545; border-radius: 6px; padding: 12px; text-align: center;">
      <p style="font-weight: bold; font-size: 11pt; color: #721c24;">REJEITADO</p>
      ${quote.rejectedAt ? `<p style="font-size: 9pt; color: #721c24; margin-top: 6px;">Rejeitado em: ${fmtDate(quote.rejectedAt)}</p>` : ""}
    </div>
  </div>` : ""}

  ${quote.status === "pending" ? `
  <div class="approval-link">
    <p>Para aprovar ou rejeitar este orcamento, acesse:</p>
    <a href="${approvalLink}">${approvalLink}</a>
    <p style="font-size: 9pt; color: #155724; margin-top: 6px;">Criado em: ${fmtDate(quote.createdAt)}</p>
  </div>` : ""}

  <div class="footer">
    <p>${esc(nomeLoja)} - Orcamento gerado em ${new Date().toLocaleDateString("pt-BR")} as ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</p>
  </div>
</body></html>`;

    return new NextResponse(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
      },
    });

  } catch (error) {
    console.error("Quote PDF error:", error);
    return NextResponse.json(
      { error: "Failed to generate quote PDF" },
      { status: 500 },
    );
  }
}
