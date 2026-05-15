import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { withTenant, withAdmin } from "@/server/db";

/**
 * GET /api/pdv/[id]/termo-entrega
 *
 * Generates delivery term HTML — faithful to Laravel termo-entrega.blade.php.
 * Shows: store header, customer data, delivered items, receipt declaration, signature.
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

    const customer = sale.customerId
      ? await withTenant(tenantId, async (tx) => {
          return tx.customer.findUnique({
            where: { id: sale.customerId! },
            select: { name: true, cpf: true, phone: true, address: true },
          });
        })
      : null;

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
      (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    const formatCpf = (cpf: string | null | undefined) => {
      if (!cpf || cpf.length !== 11) return cpf ?? "___.___.___-__";
      return `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
    };

    const customerAddress =
      typeof customer?.address === "object" && customer?.address !== null
        ? formatAddress(customer.address as Record<string, unknown>)
        : "-";

    const now = new Date();

    // Items rows
    let itemsHtml = "";
    for (const item of sale.items) {
      itemsHtml += `<tr>
        <td><strong>${esc(item.description)}</strong></td>
        <td>-</td>
        <td>-</td>
        <td>-</td>
      </tr>`;
    }

    const html = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8">
<title>Termo de Entrega - ${esc(sale.number)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 10pt; line-height: 1.5; color: #1a1a1a; margin: 10mm 12mm; }
  .header-table { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
  .header-info .nome-loja { font-size: 13pt; font-weight: bold; }
  .header-info .dados-loja { font-size: 7.5pt; color: #666; margin-top: 1px; }
  .header-right { text-align: right; vertical-align: middle; }
  .header-right .doc-label { font-size: 7pt; color: #888; text-transform: uppercase; letter-spacing: 1px; }
  .header-right .doc-numero { font-size: 11pt; font-weight: bold; color: #c9a55c; }
  .header-right .doc-data { font-size: 7.5pt; color: #888; }
  .header-divider { border: none; border-top: 2px solid #c9a55c; margin-bottom: 8px; }
  .title { text-align: center; font-size: 12pt; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 10px; padding: 5px; background: #f3f4f6; border-left: 3px solid #c9a55c; }
  .info-table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  .info-table td { padding: 2px 6px; font-size: 9pt; vertical-align: top; }
  .info-table .label { font-weight: bold; color: #666; width: 80px; font-size: 7.5pt; text-transform: uppercase; }
  .section-title { font-size: 9pt; font-weight: bold; text-transform: uppercase; color: #fff; background: #1a1a2e; padding: 3px 8px; margin: 8px 0 4px; }
  table.itens { width: 100%; border-collapse: collapse; margin-bottom: 8px; font-size: 9pt; }
  table.itens th { background: #f3f4f6; padding: 4px 6px; font-size: 8pt; text-transform: uppercase; text-align: left; border: 1px solid #ddd; }
  table.itens td { padding: 4px 6px; border: 1px solid #e5e7eb; }
  .declaracao { border: 1px solid #d1e7dd; background: #f0fdf4; padding: 6px 8px; border-radius: 3px; margin: 6px 0; font-size: 8.5pt; }
  .declaracao h4 { font-size: 9pt; color: #166534; margin-bottom: 3px; }
  .resumo { background: #f3f4f6; border: 1px solid #e5e7eb; padding: 4px 8px; font-size: 9pt; margin: 6px 0; }
  .assinaturas { width: 100%; margin-top: 25px; }
  .assinaturas td { width: 50%; text-align: center; vertical-align: bottom; padding: 0 20px; }
  .assinatura-linha { border-top: 1px solid #333; padding-top: 3px; font-size: 8.5pt; margin-top: 35px; }
  .assinatura-cpf { font-size: 7.5pt; color: #666; margin-top: 1px; }
  .footer { text-align: center; font-size: 7.5pt; color: #999; margin-top: 10px; border-top: 1px solid #e5e7eb; padding-top: 4px; }
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
      <div class="doc-data">${sale.saleDate.toLocaleDateString("pt-BR")}</div>
    </td>
  </tr></table>
  <hr class="header-divider">

  <div class="title">Termo de Entrega e Recebimento</div>

  <table class="info-table">
    <tr>
      <td class="label">Cliente</td>
      <td><strong>${esc(customer?.name ?? "Nao identificado")}</strong></td>
      <td class="label">CPF</td>
      <td>${formatCpf(customer?.cpf)}</td>
    </tr>
    <tr>
      <td class="label">Telefone</td>
      <td>${esc(customer?.phone ?? "-")}</td>
      <td class="label">Endereco</td>
      <td>${esc(customerAddress)}</td>
    </tr>
  </table>

  <div class="section-title">Produto(s) Entregue(s)</div>
  <table class="itens">
    <thead><tr>
      <th>Produto</th>
      <th>IMEI</th>
      <th>N. Serie</th>
      <th>Condicao</th>
    </tr></thead>
    <tbody>${itemsHtml}</tbody>
  </table>

  <div class="declaracao">
    <h4>DECLARACAO DE RECEBIMENTO</h4>
    <p>Eu, <strong>${esc(customer?.name ?? "____________________")}</strong>, declaro que recebi o(s) produto(s) acima descrito(s) em perfeitas condicoes de funcionamento, conforme verificado no momento da entrega. Declaro que estou ciente das condicoes de garantia informadas e que fui orientado(a) sobre o uso adequado do(s) produto(s).</p>
  </div>

  <div class="resumo">
    <strong>Data da Entrega:</strong> ${sale.saleDate.toLocaleDateString("pt-BR")} |
    <strong>Venda:</strong> ${esc(sale.number)}
  </div>

  <table class="assinaturas"><tr>
    <td>
      <div class="assinatura-linha">${esc(customer?.name ?? "Cliente")}</div>
      <div class="assinatura-cpf">CPF: ${formatCpf(customer?.cpf)}</div>
    </td>
  </tr></table>

  <div class="footer">
    Documento gerado em ${now.toLocaleDateString("pt-BR")} ${now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} | Este documento deve ser guardado como comprovante de entrega
  </div>
</body></html>`;

    return new NextResponse(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (err) {
    console.error("Delivery term generation error:", err);
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
