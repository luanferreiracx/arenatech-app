import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { withTenant, withAdmin } from "@/server/db";
import { formatCnpj, formatCpf } from "@/lib/utils";

/**
 * GET /api/purchases/[id]/termo-responsabilidade
 *
 * Gera o PDF do Termo de Responsabilidade para a compra de aparelho.
 * Paridade Laravel `CompraAparelhoController::termoResponsabilidade`.
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
  const tenantId = cookies.get("x-active-tenant")?.value ?? session.activeTenantId;
  if (!tenantId) {
    return NextResponse.json({ error: "No active tenant" }, { status: 403 });
  }

  try {
    const purchase = await withTenant(tenantId, async (tx) => {
      return tx.devicePurchase.findUnique({ where: { id } });
    });

    if (!purchase) {
      return NextResponse.json({ error: "Compra nao encontrada" }, { status: 404 });
    }

    // Vendedor: customer ou supplier conforme sellerType
    let sellerName = "";
    let sellerDoc = "";
    let sellerPhone = "";
    let sellerAddress = "";

    if (purchase.sellerType === "customer" && purchase.customerId) {
      const customer = await withTenant(tenantId, async (tx) =>
        tx.customer.findUnique({
          where: { id: purchase.customerId! },
          select: {
            name: true,
            cpf: true,
            cnpj: true,
            phone: true,
            street: true,
            streetNumber: true,
            neighborhood: true,
            city: true,
            state: true,
          },
        }),
      );
      if (customer) {
        sellerName = customer.name;
        sellerDoc = customer.cpf
          ? `CPF: ${formatCpf(customer.cpf)}`
          : customer.cnpj
            ? `CNPJ: ${formatCnpj(customer.cnpj)}`
            : "";
        sellerPhone = customer.phone ?? "";
        const parts = [
          customer.street,
          customer.streetNumber,
          customer.neighborhood,
          customer.city,
          customer.state,
        ].filter(Boolean);
        sellerAddress = parts.join(", ");
      }
    } else if (purchase.sellerType === "supplier" && purchase.supplierId) {
      const supplier = await withTenant(tenantId, async (tx) =>
        tx.supplier.findUnique({
          where: { id: purchase.supplierId! },
          select: {
            name: true,
            cpf: true,
            cnpj: true,
            phone: true,
            street: true,
            streetNumber: true,
            neighborhood: true,
            city: true,
            state: true,
          },
        }),
      );
      if (supplier) {
        sellerName = supplier.name;
        sellerDoc = supplier.cnpj
          ? `CNPJ: ${formatCnpj(supplier.cnpj)}`
          : supplier.cpf
            ? `CPF: ${formatCpf(supplier.cpf)}`
            : "";
        sellerPhone = supplier.phone ?? "";
        const parts = [
          supplier.street,
          supplier.streetNumber,
          supplier.neighborhood,
          supplier.city,
          supplier.state,
        ].filter(Boolean);
        sellerAddress = parts.join(", ");
      }
    }

    const [tenant, settings] = await Promise.all([
      withAdmin(async (tx) =>
        tx.tenant.findUnique({ where: { id: tenantId }, select: { name: true, cnpj: true } }),
      ),
      withTenant(tenantId, async (tx) =>
        tx.tenantSettings.findUnique({
          where: { tenantId },
          select: { tradeName: true, cnpj: true, phone: true, logoUrl: true },
        }),
      ),
    ]);

    const nomeLoja = settings?.tradeName ?? tenant?.name ?? "Arena Tech";
    const cnpjLoja = formatCnpj(settings?.cnpj ?? tenant?.cnpj ?? "");
    const telefoneLoja = settings?.phone ?? "";

    const esc = (s: string | null | undefined) =>
      (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    const fmt = (v: unknown) => {
      const num = Number(v ?? 0);
      return "R$ " + num.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    const fmtDate = (d: Date | null) =>
      d ? new Date(d).toLocaleDateString("pt-BR") : "-";

    const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<title>Termo de Responsabilidade - Compra ${esc(id.slice(0, 8))}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 10pt; color: #000; line-height: 1.4; margin: 15mm; }
  .header { border-bottom: 3px solid #c9a55c; padding-bottom: 12px; margin-bottom: 16px; }
  .title { font-size: 14pt; font-weight: bold; text-align: center; margin: 18px 0; }
  .section { margin-bottom: 12px; }
  .section-title { font-size: 11pt; font-weight: bold; color: #c9a55c; border-bottom: 1px solid #ddd; padding-bottom: 3px; margin-bottom: 6px; }
  .row { display: flex; justify-content: space-between; margin: 3px 0; }
  .label { font-weight: bold; color: #555; }
  table.equipment { width: 100%; border-collapse: collapse; margin-top: 6px; }
  table.equipment td { border: 1px solid #ddd; padding: 5px; }
  table.equipment .label-cell { background: #f8f8f8; font-weight: bold; width: 30%; }
  .declaration { background: #fffaf0; border-left: 4px solid #c9a55c; padding: 12px; margin: 16px 0; text-align: justify; }
  .signature-box { margin-top: 48px; text-align: center; }
  .signature-line { border-top: 1px solid #000; width: 70%; margin: 0 auto; padding-top: 6px; }
  .footer { margin-top: 32px; font-size: 8pt; color: #888; text-align: center; }
</style>
</head><body>
  <div class="header">
    <table style="width: 100%; border: none;"><tr>
      ${settings?.logoUrl ? `<td style="vertical-align: middle; width: 90px;"><img src="${esc(settings.logoUrl)}" alt="Logo" style="max-height: 50px; max-width: 80px;"></td>` : ""}
      <td style="vertical-align: middle;">
        <div style="font-size: 13pt; font-weight: bold;">${esc(nomeLoja)}</div>
        ${cnpjLoja ? `<div style="font-size: 9pt; color: #666;">${esc(cnpjLoja)}</div>` : ""}
        ${telefoneLoja ? `<div style="font-size: 9pt; color: #666;">Tel: ${esc(telefoneLoja)}</div>` : ""}
      </td>
    </tr></table>
  </div>

  <div class="title">TERMO DE RESPONSABILIDADE — COMPRA DE APARELHO</div>

  <div class="section">
    <div class="section-title">DADOS DO VENDEDOR</div>
    <div class="row"><span class="label">Nome:</span><span>${esc(sellerName) || "—"}</span></div>
    <div class="row"><span class="label">Documento:</span><span>${esc(sellerDoc) || "—"}</span></div>
    <div class="row"><span class="label">Telefone:</span><span>${esc(sellerPhone) || "—"}</span></div>
    ${sellerAddress ? `<div class="row"><span class="label">Endereco:</span><span>${esc(sellerAddress)}</span></div>` : ""}
    <div class="row"><span class="label">Tipo:</span><span>${purchase.sellerType === "supplier" ? "Fornecedor (PJ)" : "Pessoa Fisica"}</span></div>
  </div>

  <div class="section">
    <div class="section-title">DADOS DO APARELHO</div>
    <table class="equipment">
      <tr><td class="label-cell">Marca</td><td>${esc(purchase.brand) || "—"}</td></tr>
      <tr><td class="label-cell">Modelo</td><td>${esc(purchase.model) || "—"}</td></tr>
      <tr><td class="label-cell">IMEI</td><td>${esc(purchase.imei) || "—"}</td></tr>
      <tr><td class="label-cell">Numero de Serie</td><td>${esc(purchase.serial) || "—"}</td></tr>
      <tr><td class="label-cell">Condicao</td><td>${esc(purchase.condition) || "—"}</td></tr>
      ${purchase.batteryHealth ? `<tr><td class="label-cell">Saude da Bateria</td><td>${purchase.batteryHealth}%</td></tr>` : ""}
      <tr><td class="label-cell">Valor Pago</td><td><strong>${fmt(purchase.purchasePrice)}</strong></td></tr>
      <tr><td class="label-cell">Data da Compra</td><td>${fmtDate(purchase.purchaseDate)}</td></tr>
    </table>
  </div>

  ${purchase.notes ? `
  <div class="section">
    <div class="section-title">OBSERVACOES</div>
    <div style="padding: 6px; background: #f9f9f9; white-space: pre-wrap;">${esc(purchase.notes)}</div>
  </div>` : ""}

  <div class="declaration">
    <p><strong>Declaracao:</strong> Eu, <strong>${esc(sellerName)}</strong>, ${esc(sellerDoc)},
    declaro que o aparelho acima descrito e de minha propriedade legitima, livre de quaisquer
    onus, gravames, restricoes judiciais ou impedimentos legais, e nao se trata de produto
    de origem ilicita.</p>

    <p style="margin-top: 8px;">Comprometo-me a indenizar a empresa <strong>${esc(nomeLoja)}</strong>
    e responder integralmente por qualquer prejuizo, perda, danos materiais ou morais decorrentes
    de eventual reivindicacao por terceiros, autoridade publica ou orgao policial.</p>

    <p style="margin-top: 8px;">Autorizo, ainda, que a empresa proceda com a venda do aparelho a
    terceiros apos a transacao, transferindo a posse e propriedade.</p>
  </div>

  <div class="signature-box">
    <div class="signature-line">
      <strong>${esc(sellerName)}</strong><br>
      ${esc(sellerDoc)}
    </div>
  </div>

  <div class="footer">
    ${esc(nomeLoja)} — Documento gerado em ${new Date().toLocaleDateString("pt-BR")} ${new Date().toLocaleTimeString("pt-BR")}
  </div>
</body></html>`;

    return new NextResponse(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (err) {
    console.error("Purchase term PDF error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
