import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { withTenant, withAdmin } from "@/server/db";
import { valorPorExtenso } from "@/lib/valor-por-extenso";

/**
 * GET /api/service-orders/[id]/recibo
 *
 * Generates Recibo PDF — FAITHFUL to Laravel OrdemServicoPdfController::gerarHtmlRecibo.
 * "RECIBO" header, valor grande com desconto, texto recebi(emos),
 * servicos realizados, garantia (prazo + vencimento), assinatura, "SEM VALOR FISCAL".
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
        include: { items: { orderBy: { createdAt: "asc" } } },
      });
    });

    if (!order || order.deletedAt) {
      return NextResponse.json({ error: "OS not found" }, { status: 404 });
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
        select: { name: true, cnpj: true },
      })),
      withTenant(tenantId, async (tx) => tx.tenantSettings.findUnique({
        where: { tenantId },
        select: { tradeName: true, cnpj: true, phone: true },
      })),
    ]);

    const nomeLoja = settings?.tradeName ?? tenant?.name ?? "Arena Tech";
    const cnpjLoja = settings?.cnpj ?? tenant?.cnpj ?? "";
    const telefoneLoja = settings?.phone ?? "";

    const esc = (s: string | null | undefined) => (s ?? "").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    const fmt = (v: number) => "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const valorTotal = Number(order.totalAmount ?? 0);
    const valorPago = Number(order.paidAmount ?? valorTotal);
    const descontoPagamento = Number(order.paymentDiscount ?? 0);
    const formaPagamento = order.paymentMethod ?? "";

    const extenso = valorPorExtenso(valorPago);

    // Warranty
    const prazoGarantia = order.warrantyMonths ?? 3;
    const dataConclusao = order.completedDate ?? new Date();
    const vencimentoGarantia = new Date(dataConclusao);
    vencimentoGarantia.setMonth(vencimentoGarantia.getMonth() + prazoGarantia);

    // Month name
    const meses = ["", "janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
    const now = new Date();
    const mesExtenso = meses[now.getMonth() + 1] ?? "";

    // Items HTML
    let itensHtml = "";
    if (order.items.length > 0) {
      itensHtml += '<ul style="margin: 10px 0; padding-left: 20px;">';
      for (const item of order.items) {
        const qty = Math.round(Number(item.quantity));
        const unitPrice = Number(item.unitPrice);
        const subtotal = Number(item.total);
        itensHtml += `<li style="margin: 5px 0;"><strong>${esc(item.description)}</strong>`;
        if (qty > 1) {
          itensHtml += ` (${qty}x ${fmt(unitPrice)})`;
        }
        itensHtml += ` - ${fmt(subtotal)}</li>`;
      }
      itensHtml += "</ul>";
    } else {
      itensHtml = "<p><strong>Assistencia Tecnica</strong></p>";
    }

    // Parts cost
    const partsCost = Number(order.partsAmount ?? 0);
    if (partsCost > 0) {
      itensHtml += `<p style="margin-top: 10px;"><strong>Pecas/Componentes:</strong> ${fmt(partsCost)}</p>`;
    }
    const discount = Number(order.discount ?? 0);
    if (discount > 0) {
      itensHtml += `<p style="margin-top: 5px; color: #28a745;"><strong>Desconto:</strong> -${fmt(discount)}</p>`;
    }

    const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<title>Recibo - ${esc(order.number)}</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 12pt; margin: 20px; }
  .cabecalho { border-bottom: 3px solid #000; padding-bottom: 10px; margin-bottom: 15px; }
  .header-recibo { text-align: center; border: 2px solid #000; padding: 10px; margin-bottom: 12px; background: #f9f9f9; }
  .header-recibo h1 { font-size: 18pt; margin: 0; color: #333; }
  .header-recibo p { margin: 3px 0; font-size: 10pt; }
  .valor-box { background-color: #fff; color: #000; border: 2px solid #000; padding: 12px; text-align: center; margin: 12px 0; border-radius: 8px; }
  .valor-num { font-size: 18pt; font-weight: bold; }
  .corpo { text-align: justify; line-height: 1.6; margin: 15px 0; font-size: 11pt; }
  .servico-box { background: #f5f5f5; border-left: 4px solid #000; padding: 12px; margin: 15px 0; }
  .servico-titulo { font-weight: bold; color: #000; font-size: 13pt; margin-bottom: 10px; }
  .garantia-box { background: #e8f5e9; border: 2px dashed #4caf50; padding: 12px; margin: 15px 0; border-radius: 8px; }
  .garantia-titulo { font-weight: bold; color: #2e7d32; font-size: 12pt; margin-bottom: 5px; }
  .garantia-info { font-size: 10pt; color: #555; }
  .assinatura { margin-top: 40px; text-align: center; }
  .linha { border-top: 2px solid #000; width: 450px; margin: 0 auto; padding-top: 8px; font-weight: bold; font-size: 11pt; }
  .rodape { position: fixed; bottom: 20px; left: 20px; right: 20px; text-align: center; font-size: 8pt; color: #999; border-top: 1px solid #ddd; padding-top: 10px; }
  @media print { body { margin: 0; } }
</style>
</head><body>
  <div class="cabecalho">
    <table style="width: 100%; border: none;"><tr>
      <td style="vertical-align: middle;">
        <div style="font-size: 11pt; font-weight: bold;">${esc(nomeLoja)}${cnpjLoja ? ` - CNPJ: ${esc(cnpjLoja)}` : ""}</div>
        <div style="font-size: 9pt; color: #666;">Assistencia Tecnica Especializada</div>
        ${telefoneLoja ? `<div style="font-size: 9pt; color: #666;">${esc(telefoneLoja)}</div>` : ""}
      </td>
    </tr></table>
  </div>

  <div class="header-recibo">
    <h1>RECIBO</h1>
    <p><strong>No:</strong> ${esc(order.number)}</p>
    <p><strong>Data de Emissao:</strong> ${now.toLocaleDateString("pt-BR")}</p>
  </div>

  <div class="valor-box">
    <div class="valor-num">${fmt(valorPago)}</div>
    <div style="margin-top: 5px; font-size: 10pt;">(${extenso})</div>
    ${descontoPagamento > 0 ? `<div style="margin-top: 8px; font-size: 9pt; color: #28a745;"><strong>Desconto no pagamento:</strong> ${fmt(descontoPagamento)} (Valor original: ${fmt(valorTotal)})</div>` : ""}
    ${formaPagamento ? `<div style="margin-top: 5px; font-size: 9pt;"><strong>Forma de Pagamento:</strong> ${esc(formaPagamento)}</div>` : ""}
  </div>

  <div class="corpo">
    Recebi(emos) de <strong>${esc(customer?.name)}</strong>,
    portador(a) do CPF <strong>${esc(customer?.cpf)}</strong>,
    a quantia de <strong>${fmt(valorPago)}</strong>
    (${extenso})${descontoPagamento > 0 ? `, com desconto de ${fmt(descontoPagamento)} sobre o valor original de ${fmt(valorTotal)}` : ""},
    referente ao(s) servico(s) de assistencia tecnica prestado(s) conforme
    Ordem de Servico <strong>${esc(order.number)}</strong>.${formaPagamento ? ` Pagamento realizado via <strong>${esc(formaPagamento)}</strong>.` : ""}
  </div>

  <div class="servico-box">
    <div class="servico-titulo">SERVICO(S) REALIZADO(S)</div>
    ${itensHtml}
    <p style="margin-top: 10px;">Equipamento: <strong>${esc(order.deviceType) ?? "Nao informado"}</strong>${order.deviceModel ? ` - ${esc(order.deviceModel)}` : ""}</p>
  </div>

  <div class="garantia-box">
    <div class="garantia-titulo">GARANTIA DO SERVICO</div>
    <div class="garantia-info">
      <p><strong>Prazo de Garantia:</strong> ${prazoGarantia} meses</p>
      <p><strong>Valida ate:</strong> ${vencimentoGarantia.toLocaleDateString("pt-BR")}</p>
      <p style="margin-top: 10px; font-size: 9pt;">
        A garantia cobre defeitos relacionados ao servico realizado. Nao cobre danos causados por mau uso,
        quedas, contato com liquidos ou intervencao de terceiros.
      </p>
    </div>
  </div>

  <div class="corpo" style="text-align: right; margin-top: 40px;">
    ${now.getDate()} de ${mesExtenso} de ${now.getFullYear()}.
  </div>

  <div class="assinatura">
    <p style="font-size: 11pt; color: #2e7d32; font-weight: bold; margin-bottom: 5px; font-style: italic;">~ Assinado eletronicamente ~</p>
    <div class="linha">Assinatura do Prestador de Servico</div>
    <p style="font-size: 10pt; color: #666; margin-top: 10px;">
      ${esc(nomeLoja)}<br>
      ${cnpjLoja ? `CNPJ: ${esc(cnpjLoja)}` : ""}
    </p>
  </div>

  <div class="rodape">
    Documento gerado em ${now.toLocaleDateString("pt-BR")} ${now.toLocaleTimeString("pt-BR")} - OS: ${esc(order.number)} - SEM VALOR FISCAL
  </div>
</body></html>`;

    return new NextResponse(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (err) {
    console.error("Recibo generation error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
