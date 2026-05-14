import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { withTenant, withAdmin } from "@/server/db";

/**
 * GET /api/pdv/[id]/recibo
 *
 * Generates sale receipt HTML — faithful to Laravel recibo.blade.php.
 * Shows: store header, customer info, sale items, upgrades, totals, payments, signature.
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
    const sale = await withTenant(tenantId, async (tx) => {
      return tx.sale.findUnique({
        where: { id },
        include: { items: { orderBy: { createdAt: "asc" } } },
      });
    });

    if (!sale || sale.deletedAt) {
      return NextResponse.json({ error: "Venda nao encontrada" }, { status: 404 });
    }

    // Fetch customer
    const customer = sale.customerId
      ? await withTenant(tenantId, async (tx) => {
          return tx.customer.findUnique({
            where: { id: sale.customerId! },
            select: { name: true, cpf: true, phone: true },
          });
        })
      : null;

    // Fetch seller name
    const seller = await withAdmin(async (tx) => {
      return tx.user.findUnique({
        where: { id: sale.sellerId },
        select: { name: true },
      });
    });

    // Fetch tenant/settings
    const [tenant, settings] = await Promise.all([
      withAdmin(async (tx) =>
        tx.tenant.findUnique({
          where: { id: tenantId },
          select: { name: true, cnpj: true },
        })
      ),
      withTenant(tenantId, async (tx) =>
        tx.tenantSettings.findUnique({
          where: { tenantId },
          select: { tradeName: true, cnpj: true, phone: true, address: true },
        })
      ),
    ]);

    const nomeLoja = settings?.tradeName ?? tenant?.name ?? "Arena Tech";
    const cnpjLoja = settings?.cnpj ?? tenant?.cnpj ?? "";
    const telefoneLoja = settings?.phone ?? "";
    const enderecoLoja =
      typeof settings?.address === "object" && settings?.address !== null
        ? formatAddress(settings.address as Record<string, unknown>)
        : "";

    const esc = (s: string | null | undefined) =>
      (s ?? "").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    const fmt = (v: number) =>
      "R$ " +
      v.toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

    const subtotal = Number(sale.subtotal);
    const discountAmount = Number(sale.discountAmount);
    const totalAmount = Number(sale.totalAmount);
    const now = new Date();

    // Payment details
    const paymentDetails = (sale.paymentDetails ?? []) as Array<{
      method: string;
      amount: number;
      installments?: number;
    }>;

    const PAYMENT_LABELS: Record<string, string> = {
      dinheiro: "Dinheiro",
      pix: "PIX",
      cartao_credito: "Cartao de Credito",
      cartao_debito: "Cartao de Debito",
      depix: "DEPIX",
      crediario: "Crediario",
    };

    // Format CPF
    const formatCpf = (cpf: string | null | undefined) => {
      if (!cpf || cpf.length !== 11) return cpf ?? "";
      return `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
    };

    // Items HTML
    let itemsHtml = "";
    for (let i = 0; i < sale.items.length; i++) {
      const item = sale.items[i]!;
      const bgClass = i % 2 === 1 ? ' class="even"' : "";
      itemsHtml += `<tr${bgClass}>
        <td><span class="produto-nome">${esc(item.description)}</span></td>
        <td class="text-right">${item.quantity}</td>
        <td class="text-right">${fmt(Number(item.unitPrice))}</td>
        <td class="text-right"><strong>${fmt(Number(item.total))}</strong></td>
      </tr>`;
    }

    // Payment rows
    let paymentHtml = "";
    for (const p of paymentDetails) {
      const methodLabel = PAYMENT_LABELS[p.method] ?? p.method;
      const amount = p.amount / 100; // cents to reais
      const installments = p.installments ?? 1;
      paymentHtml += `<tr class="pagamento">
        <td class="label">${esc(methodLabel)}${installments > 1 ? ` (${installments}x de ${fmt(amount / installments)})` : ""}</td>
        <td class="valor">${fmt(amount)}</td>
      </tr>`;
    }

    const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<title>Recibo - ${esc(sale.number)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 9pt; color: #1a1a1a; line-height: 1.35; margin: 10mm 12mm; }
  .header-table { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
  .header-info .nome-loja { font-size: 13pt; font-weight: bold; color: #1a1a1a; }
  .header-info .dados-loja { font-size: 7.5pt; color: #666; margin-top: 1px; }
  .header-right { text-align: right; vertical-align: middle; }
  .header-right .doc-label { font-size: 7pt; color: #888; text-transform: uppercase; letter-spacing: 1px; }
  .header-right .doc-numero { font-size: 14pt; font-weight: bold; color: #c9a55c; }
  .header-right .doc-data { font-size: 7.5pt; color: #888; }
  .header-divider { border: none; border-top: 2px solid #c9a55c; margin-bottom: 10px; }
  .section { margin-bottom: 8px; page-break-inside: avoid; }
  .section-title { background: #f3f4f6; padding: 3px 8px; font-weight: bold; font-size: 8.5pt; margin-bottom: 5px; border-left: 3px solid #c9a55c; color: #333; }
  .info-cols { width: 100%; border-collapse: collapse; }
  .info-cols td { vertical-align: top; width: 50%; }
  .field { margin-bottom: 2px; }
  .field-label { font-size: 7pt; font-weight: bold; color: #888; text-transform: uppercase; }
  .field-value { font-size: 9pt; padding: 1px 4px; background: #fafafa; border: 1px solid #eee; }
  table.items { width: 100%; border-collapse: collapse; margin-bottom: 8px; font-size: 9pt; }
  table.items th { background: #1a1a2e; color: #fff; padding: 4px 6px; font-size: 7.5pt; text-transform: uppercase; font-weight: bold; text-align: left; border: 1px solid #1a1a2e; }
  table.items th.text-right { text-align: right; }
  table.items td { padding: 4px 6px; border: 1px solid #e5e7eb; font-size: 8.5pt; }
  table.items td.text-right { text-align: right; }
  table.items tr.even { background: #fafafa; }
  .produto-nome { font-weight: bold; }
  .totais-wrapper { width: 100%; text-align: right; margin-bottom: 12px; }
  table.totais { width: 250px; border-collapse: collapse; font-size: 9pt; margin-left: auto; border: 1px solid #e5e7eb; }
  table.totais td { padding: 4px 8px; border-bottom: 1px solid #f0f0f0; }
  table.totais td.label { text-align: left; color: #555; }
  table.totais td.valor { text-align: right; font-weight: bold; }
  table.totais tr.desconto td { color: #dc2626; }
  table.totais tr.total td { background: #1a1a2e; color: #fff; font-size: 12pt; font-weight: bold; padding: 8px; }
  table.totais tr.pagamento td { background: #f8f9fa; color: #666; font-size: 7.5pt; padding: 4px 8px; }
  .footer { border-top: 2px solid #c9a55c; padding-top: 8px; text-align: center; margin-top: 15px; }
  .footer-detalhe { font-size: 7.5pt; color: #999; }
  .footer-legal { font-size: 6.5pt; color: #aaa; margin-top: 4px; line-height: 1.4; }
  @media print { body { margin: 0; } }
</style>
</head><body>
  <table class="header-table"><tr>
    <td class="header-info">
      <div class="nome-loja">${esc(nomeLoja)}</div>
      <div class="dados-loja">
        ${cnpjLoja ? `CNPJ: ${esc(cnpjLoja)} ` : ""}
        ${telefoneLoja ? `| Tel: ${esc(telefoneLoja)} ` : ""}
        ${enderecoLoja ? `<br>${esc(enderecoLoja)}` : ""}
      </div>
    </td>
    <td class="header-right">
      <div class="doc-label">Venda</div>
      <div class="doc-numero">${esc(sale.number)}</div>
      <div class="doc-data">${sale.saleDate.toLocaleDateString("pt-BR")} ${sale.saleDate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</div>
    </td>
  </tr></table>
  <hr class="header-divider">

  <div class="section">
    <table class="info-cols"><tr>
      <td>
        <div class="section-title">Cliente</div>
        ${
          customer
            ? `<div class="field"><span class="field-label">Nome</span><div class="field-value">${esc(customer.name)}</div></div>
               ${customer.cpf ? `<div class="field"><span class="field-label">CPF</span><div class="field-value">${formatCpf(customer.cpf)}</div></div>` : ""}
               ${customer.phone ? `<div class="field"><span class="field-label">Telefone</span><div class="field-value">${esc(customer.phone)}</div></div>` : ""}`
            : `<div class="field"><div class="field-value" style="color: #999;">Consumidor final</div></div>`
        }
      </td>
      <td>
        <div class="section-title">Dados da Venda</div>
        <div class="field"><span class="field-label">Vendedor</span><div class="field-value">${esc(seller?.name ?? "-")}</div></div>
      </td>
    </tr></table>
  </div>

  <div class="section">
    <div class="section-title">Itens da Venda</div>
    <table class="items">
      <thead><tr>
        <th>Produto</th>
        <th class="text-right">Qtd</th>
        <th class="text-right">Preco Unit.</th>
        <th class="text-right">Subtotal</th>
      </tr></thead>
      <tbody>${itemsHtml}</tbody>
    </table>
  </div>

  <div class="totais-wrapper">
    <table class="totais">
      <tr><td class="label">Subtotal</td><td class="valor">${fmt(subtotal)}</td></tr>
      ${discountAmount > 0 ? `<tr class="desconto"><td class="label">Desconto${sale.discountType === "percentage" ? ` (${Number(sale.discountValue)}%)` : ""}</td><td class="valor">-${fmt(discountAmount)}</td></tr>` : ""}
      <tr class="total"><td class="label">TOTAL</td><td class="valor">${fmt(totalAmount)}</td></tr>
    </table>
  </div>

  ${
    paymentDetails.length > 0
      ? `<div class="totais-wrapper" style="margin-top: 8px;">
    <table class="totais">
      <tr><td colspan="2" style="font-size: 8pt; font-weight: bold; text-transform: uppercase; color: #555; padding-top: 6px;">Pagamentos</td></tr>
      ${paymentHtml}
    </table>
  </div>`
      : ""
  }

  <div style="margin-top: 30px; text-align: center;">
    <div style="max-width: 280px; margin: 0 auto; padding: 10px 0; border: 1px dashed #10b981; border-radius: 6px; background: #f0fdf4;">
      <div style="font-size: 8pt; color: #10b981; font-style: italic;">~assinado eletronicamente~</div>
    </div>
    <div style="margin-top: 4px;">
      <div style="font-size: 8.5pt; font-weight: bold;">${esc(nomeLoja)}</div>
      ${cnpjLoja ? `<div style="font-size: 7pt; color: #888;">CNPJ: ${esc(cnpjLoja)}</div>` : ""}
    </div>
  </div>

  <div class="footer">
    <div class="footer-detalhe">${esc(nomeLoja)}${cnpjLoja ? ` | CNPJ: ${esc(cnpjLoja)}` : ""}${telefoneLoja ? ` | ${esc(telefoneLoja)}` : ""}</div>
    <div class="footer-detalhe" style="margin-top: 2px;">Documento gerado em ${now.toLocaleDateString("pt-BR")} as ${now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</div>
    <div class="footer-legal">Este documento e valido como comprovante de transacao comercial. Conserve-o para fins de garantia e eventuais trocas conforme politica da loja.</div>
  </div>
</body></html>`;

    return new NextResponse(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (err) {
    console.error("Sale receipt generation error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

function formatAddress(addr: Record<string, unknown>): string {
  const parts: string[] = [];
  if (addr.street) parts.push(String(addr.street));
  if (addr.number) parts.push(String(addr.number));
  if (addr.neighborhood) parts.push(String(addr.neighborhood));
  if (addr.city) parts.push(String(addr.city));
  if (addr.state) parts.push(String(addr.state));
  return parts.join(", ");
}
