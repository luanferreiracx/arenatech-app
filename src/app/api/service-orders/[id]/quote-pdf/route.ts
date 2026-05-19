import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { withTenant, withAdmin } from "@/server/db";

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
    ${customer?.cpf ? `<div class="row"><span class="label">CPF:</span> <span>${esc(customer.cpf)}</span></div>` : ""}
    ${customer?.phone ? `<div class="row"><span class="label">Telefone:</span> <span>${esc(customer.phone)}</span></div>` : ""}
  </div>

  <div class="section">
    <div class="section-title">EQUIPAMENTO</div>
    <div class="row"><span class="label">Tipo:</span> <span>${esc(order.deviceType)}</span></div>
    <div class="row"><span class="label">Modelo:</span> <span>${esc(order.deviceModel)}</span></div>
    ${order.imei ? `<div class="row"><span class="label">IMEI:</span> <span>${esc(order.imei)}</span></div>` : ""}
  </div>

  ${itemsHtml ? `<div class="section"><div class="section-title">ITENS ATUAIS</div>${itemsHtml}</div>` : ""}

  <div class="section">
    <div class="section-title">COMPARATIVO DE VALORES</div>
    <div class="comparison">
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

  <div class="section">
    <div class="section-title">MOTIVO DA ALTERACAO</div>
    <div class="reason">${esc(quote.reason)}</div>
    ${quote.additionalServices ? `<p style="font-size: 9pt; margin-top: 4px;"><strong>Servicos adicionais:</strong> ${esc(quote.additionalServices)}</p>` : ""}
  </div>

  <div class="section">
    <div class="section-title">STATUS</div>
    <div class="row"><span class="label">Status:</span> <span class="value">${quote.status === "approved" ? "APROVADO" : quote.status === "rejected" ? "REJEITADO" : "PENDENTE"}</span></div>
    <div class="row"><span class="label">Criado em:</span> <span>${fmtDate(quote.createdAt)}</span></div>
    ${quote.approvedAt ? `<div class="row"><span class="label">Aprovado em:</span> <span>${fmtDate(quote.approvedAt)}</span></div>` : ""}
    ${quote.rejectedAt ? `<div class="row"><span class="label">Rejeitado em:</span> <span>${fmtDate(quote.rejectedAt)}</span></div>` : ""}
  </div>

  ${quote.status === "pending" ? `
  <div class="approval-link">
    <p>Para aprovar ou rejeitar este orcamento, acesse:</p>
    <a href="${approvalLink}">${approvalLink}</a>
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
