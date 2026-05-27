import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { auth } from "@/server/auth";
import { withTenant } from "@/server/db";


/**
 * GET /api/quick-sales/[id]/recibo
 *
 * Generates a receipt HTML page for a paid quick sale.
 * Faithful to Laravel vendas-avulsas/pdf/recibo.blade.php layout.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenantId =
    req.cookies.get("x-active-tenant")?.value ?? session.activeTenantId;

  if (!tenantId) {
    return NextResponse.json({ error: "No active tenant" }, { status: 403 });
  }

  try {
    const sale = await withTenant(tenantId, async (tx) => {
      return tx.quickSale.findUnique({ where: { id } });
    });

    if (!sale || sale.deletedAt) {
      return NextResponse.json(
        { error: "Venda avulsa nao encontrada" },
        { status: 404 }
      );
    }

    if (sale.status !== "PAID") {
      return NextResponse.json(
        { error: "Recibo disponivel apenas para vendas pagas" },
        { status: 403 }
      );
    }

    const settings = await withTenant(tenantId, async (tx) => {
      return tx.tenantSettings.findUnique({
        where: { tenantId },
        select: { tradeName: true, cnpj: true, phone: true },
      });
    });

    const nomeLoja = settings?.tradeName ?? "Arena Tech";
    const cnpjLoja = settings?.cnpj ?? "";

    const esc = (s: string | null | undefined) =>
      (s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    const fmt = (v: number) =>
      `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const unitPrice = Number(sale.unitPrice);
    const quantity = sale.quantity;
    const discount = Number(sale.discount);
    const totalAmount = Number(sale.totalAmount);
    const subtotal = unitPrice * quantity;

    const now = new Date();
    const paidAtStr = sale.paidAt
      ? new Date(sale.paidAt).toLocaleDateString("pt-BR", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "";

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Recibo - ${esc(sale.number)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: Arial, sans-serif;
    font-size: 10px;
    color: #111;
    background: #fff;
    padding: 6px 8px;
  }
  .center { text-align: center; }
  .bold { font-weight: bold; }
  hr {
    border: none;
    border-top: 1px dashed #aaa;
    margin: 5px 0;
  }
  hr.solid {
    border-top: 1px solid #ccc;
  }
  .header { text-align: center; margin-bottom: 4px; }
  .header .empresa { font-size: 14px; font-weight: bold; letter-spacing: 1px; }
  .header .subtitulo { font-size: 9px; color: #555; margin-top: 2px; }
  .section-label {
    font-size: 8px;
    font-weight: bold;
    color: #555;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 2px;
  }
  table.values {
    width: 100%;
    border-collapse: collapse;
  }
  table.values td {
    padding: 1px 0;
    font-size: 10px;
    vertical-align: top;
  }
  table.values td.right { text-align: right; }
  table.values tr.total td {
    font-size: 12px;
    font-weight: bold;
    padding-top: 3px;
    border-top: 1px solid #aaa;
  }
  .confirmed-box {
    text-align: center;
    border: 1px solid #333;
    padding: 4px 3px;
    margin: 5px 0;
  }
  .confirmed-text {
    font-size: 11px;
    font-weight: bold;
    letter-spacing: 0.3px;
  }
  .footer { text-align: center; font-size: 8px; color: #666; margin-top: 4px; }
  @media print { body { margin: 0; } }
</style>
</head>
<body>

<div class="header">
  <div class="empresa">${esc(nomeLoja)}</div>
  <div class="subtitulo">Recibo de Pagamento</div>
</div>

<hr class="solid">

<div class="section-label">Documento</div>
<div>N ${esc(sale.number)}</div>
<div>Emitido: ${now.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</div>

<hr>

<div class="section-label">Pagador</div>
${sale.buyerName ? `<div class="bold">${esc(sale.buyerName)}</div>` : "<div>-</div>"}
${sale.cpfCnpj ? `<div>CPF/CNPJ: ${esc(sale.cpfCnpj)}</div>` : ""}
${sale.phone ? `<div>Tel: ${esc(sale.phone)}</div>` : ""}

<hr>

<div class="section-label">Produto / Servico</div>
<div class="bold">${esc(sale.productDescription)}</div>
<div>${quantity} un x ${fmt(unitPrice)}</div>

<hr>

<table class="values">
  <tr>
    <td>Subtotal</td>
    <td class="right">${fmt(subtotal)}</td>
  </tr>
  ${
    discount > 0
      ? `<tr>
    <td>Desconto</td>
    <td class="right">- ${fmt(discount)}</td>
  </tr>`
      : ""
  }
  <tr class="total">
    <td>TOTAL</td>
    <td class="right">${fmt(totalAmount)}</td>
  </tr>
</table>
<div style="margin-top: 3px; font-size: 9px; color: #444;">Forma: DEPIX (PIX)</div>

<hr>

<div class="confirmed-box">
  <div class="confirmed-text">PAGAMENTO CONFIRMADO</div>
  ${paidAtStr ? `<div style="margin-top: 2px; font-size: 9px;">Pago em: ${paidAtStr}</div>` : ""}
</div>

<hr>

<div class="footer">
  Gerado em: ${now.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}<br>
  ${esc(nomeLoja)}${cnpjLoja ? ` - CNPJ: ${esc(cnpjLoja)}` : ""} - Recibo nao fiscal
</div>

</body>
</html>`;

    return new NextResponse(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (err) {
    logger.error("Quick sale recibo generation error:", { err: String(err) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
