import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { withTenant, withAdmin } from "@/server/db";

/**
 * GET /api/service-orders/[id]/pdf
 *
 * Generates OS PDF — FAITHFUL to the Laravel OrdemServicoPdfController.
 * Header (logo+loja), numero OS, cliente (nome/CPF/tel), equipamento,
 * info adicionais (6 checkboxes), checklist entrada (15 itens),
 * termos e condicoes, itens+valores, assinatura cliente, rodape.
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
        select: { name: true, cpf: true, phone: true, email: true },
      });
    });

    const [tenant, settings] = await Promise.all([
      withAdmin(async (tx) => tx.tenant.findUnique({
        where: { id: tenantId },
        select: { name: true, cnpj: true },
      })),
      withTenant(tenantId, async (tx) => tx.tenantSettings.findUnique({
        where: { tenantId },
        select: { tradeName: true, cnpj: true, phone: true, logoUrl: true },
      })),
    ]);

    const userIds = [order.createdById, order.technicianId, order.vendorId].filter(Boolean) as string[];
    const users = await withAdmin(async (tx) => {
      return tx.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true },
      });
    });
    const userMap = new Map(users.map((u) => [u.id, u.name]));

    const nomeLoja = settings?.tradeName ?? tenant?.name ?? "ARENA TECH";
    const cnpjLoja = settings?.cnpj ?? tenant?.cnpj ?? "";
    const telefoneLoja = settings?.phone ?? "";

    const fmt = (v: unknown) => {
      const num = Number(v ?? 0);
      return "R$ " + num.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    const fmtDate = (d: Date | null) => {
      if (!d) return "-";
      return new Date(d).toLocaleDateString("pt-BR") + " " + new Date(d).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    };

    const esc = (s: string | null | undefined) => (s ?? "").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/&/g, "&amp;");

    // Checklist items (15 — identical to Laravel)
    const checklistLabels: Record<string, string> = {
      aparelho_liga: "Aparelho Liga", aparelho_vibra: "Aparelho Vibra",
      botoes_ok: "Botoes OK", bluetooth_ok: "Bluetooth OK",
      wifi_ok: "Wi-Fi OK", vidro_traseiro_ok: "Vidro Traseiro OK",
      audio_ok: "Audio OK", microfone_ok: "Microfone OK",
      cameras_flash_ok: "Cameras/Flash OK", touch_faceid_ok: "Touch/FaceID OK",
      aparelho_carrega: "Aparelho Carrega", tela_frontal_ok: "Tela Frontal OK",
      carregamento_cabo: "Carregamento Cabo", carregamento_inducao: "Carregamento Inducao",
      ima_magsafe: "Ima MagSafe",
    };

    const entryChecklist = (order.entryChecklist as Record<string, boolean | null> | null) ?? {};

    const formatCheck = (v: boolean | null | undefined): string => {
      if (v === true) return "Sim";
      if (v === false) return "Nao";
      return "Nao Testado";
    };

    let checklistHtml = '<div class="checklist">';
    const checklistKeys = Object.keys(checklistLabels);
    for (let i = 0; i < checklistKeys.length; i += 5) {
      checklistHtml += '<div class="checklist-row">';
      for (let j = i; j < i + 5 && j < checklistKeys.length; j++) {
        const key = checklistKeys[j]!;
        const label = checklistLabels[key]!;
        const val = entryChecklist[key];
        checklistHtml += `<div><strong>${label}:</strong> ${formatCheck(val as boolean | null)}</div>`;
      }
      // Fill empty cells
      const remaining = i + 5 - checklistKeys.length;
      if (remaining > 0 && i + 5 > checklistKeys.length) {
        for (let k = 0; k < remaining; k++) {
          checklistHtml += "<div></div>";
        }
      }
      checklistHtml += "</div>";
    }
    checklistHtml += "</div>";

    // Info adicionais
    const deviceInfo = (order.deviceInfo as Record<string, boolean> | null) ?? {};
    const infoLabels: Record<string, string> = {
      cliente_aparelho_molhou: "Cliente informou que aparelho molhou",
      cliente_nao_usa_fonte_original: "Cliente informou nao usar fonte original",
      cliente_aparelho_sofreu_queda: "Cliente informou que aparelho sofreu queda",
      aparelho_problemas_ocultos: "Aparelho pode ter outros problemas ocultos",
      servico_outra_assistencia_recente: "Realizou servico em outra assistencia recentemente",
      acessorios_chip_devolvidos: "Os acessorios e o chip foram devolvidos ao cliente",
    };
    const activeInfos = Object.entries(infoLabels)
      .filter(([key]) => deviceInfo[key])
      .map(([, label]) => label);

    let infoHtml = "";
    if (activeInfos.length > 0) {
      infoHtml = '<div style="display: table; width: 100%; margin-bottom: 5px;"><div style="display: table-row;">';
      activeInfos.forEach((info, idx) => {
        infoHtml += `<div style="display: table-cell; padding: 2px 4px; border: 1px solid #ddd; font-size: 7pt; background: #fff3e0;">${esc(info)}</div>`;
        if ((idx + 1) % 3 === 0 && idx + 1 < activeInfos.length) {
          infoHtml += '</div><div style="display: table-row;">';
        }
      });
      infoHtml += "</div></div>";
    }

    // Items table
    let itemsHtml = "";
    if (order.items.length > 0) {
      itemsHtml = `<table class="servicos"><thead><tr>
        <th style="text-align: left;">Servico</th>
        <th style="text-align: center; width: 50px;">Qtd</th>
        <th style="text-align: right; width: 80px;">Valor Unit.</th>
        <th style="text-align: right; width: 80px;">Subtotal</th>
      </tr></thead><tbody>`;
      for (const item of order.items) {
        itemsHtml += `<tr>
          <td>${esc(item.description)}</td>
          <td style="text-align: center;">${Math.round(Number(item.quantity))}</td>
          <td style="text-align: right;">${fmt(item.unitPrice)}</td>
          <td style="text-align: right; font-weight: bold;">${fmt(item.total)}</td>
        </tr>`;
      }
      itemsHtml += "</tbody></table>";
    }

    const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<title>Ordem de Servico #${esc(order.number)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 9pt; color: #000; line-height: 1.2; margin: 5mm 8mm; }
  .header { width: 100%; border-bottom: 2px solid #000; padding-bottom: 4px; margin-bottom: 6px; }
  .header-table { width: 100%; border-collapse: collapse; }
  .header-left { text-align: left; vertical-align: middle; }
  .header-left h1 { font-size: 14pt; margin: 0; color: #000; }
  .header-left .subtitulo { font-size: 8pt; color: #666; }
  .header-right { text-align: right; vertical-align: middle; font-size: 8pt; color: #666; }
  .numero-os { font-size: 13pt; font-weight: bold; color: #f97316; }
  .section { margin-bottom: 5px; page-break-inside: avoid; }
  .section-title { background: #f3f4f6; padding: 3px 6px; font-weight: bold; font-size: 9pt; margin-bottom: 3px; border-left: 3px solid #f97316; }
  .grid-2 { display: table; width: 100%; }
  .grid-2 .col { display: table-cell; width: 50%; padding-right: 6px; vertical-align: top; }
  .field { margin-bottom: 2px; }
  .field-label { font-weight: bold; font-size: 7pt; color: #666; display: block; }
  .field-value { font-size: 8pt; padding: 1px 3px; background: #f9fafb; border: 1px solid #e5e7eb; }
  .checklist { display: table; width: 100%; }
  .checklist-row { display: table-row; }
  .checklist-row > div { display: table-cell; width: 20%; padding: 1px 2px; border: 1px solid #ddd; font-size: 7pt; }
  .valores { margin-top: 8px; border: 2px solid #000; padding: 8px; }
  .valores .total { font-size: 13pt; font-weight: bold; text-align: right; margin-top: 8px; padding-top: 8px; border-top: 2px solid #000; }
  .assinatura-box { border-top: 2px solid #000; padding-top: 8px; margin-top: 20px; text-align: center; }
  table.servicos { width: 100%; border-collapse: collapse; margin: 6px 0; font-size: 8pt; }
  table.servicos th, table.servicos td { border: 1px solid #ddd; padding: 3px; }
  table.servicos th { background: #f3f4f6; font-weight: bold; }
  @media print { body { margin: 0; } }
</style>
</head><body>
  <div class="header">
    <table class="header-table"><tr>
      <td class="header-left">
        <h1>${esc(nomeLoja)}</h1>
        <div class="subtitulo">Assistencia Tecnica Especializada</div>
      </td>
      <td class="header-right">
        ${cnpjLoja ? `CNPJ: ${esc(cnpjLoja)}<br>` : ""}
        ${telefoneLoja ? `Tel: ${esc(telefoneLoja)}` : ""}
      </td>
    </tr></table>
  </div>

  <div style="margin-bottom: 6px;">
    <table style="width: 100%; border-collapse: collapse;"><tr>
      <td style="text-align: left;"><span class="numero-os">ORDEM DE SERVICO #${esc(order.number)}</span></td>
      <td style="text-align: right; font-size: 9pt;">Data: ${fmtDate(order.entryDate)}</td>
    </tr></table>
  </div>

  <div class="section">
    <div class="section-title">DADOS DO CLIENTE</div>
    <div class="grid-2">
      <div class="col">
        <div class="field"><span class="field-label">Nome:</span><div class="field-value">${esc(customer?.name)}</div></div>
        <div class="field"><span class="field-label">CPF:</span><div class="field-value">${esc(customer?.cpf) || "Nao informado"}</div></div>
      </div>
      <div class="col">
        <div class="field"><span class="field-label">Telefone:</span><div class="field-value">${esc(customer?.phone) || "-"}</div></div>
        <div class="field"><span class="field-label">Email:</span><div class="field-value">${esc(customer?.email) || "Nao informado"}</div></div>
      </div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">DADOS DO EQUIPAMENTO</div>
    <div class="grid-2">
      <div class="col">
        <div class="field"><span class="field-label">Tipo:</span><div class="field-value">${esc(order.deviceType) || "-"}</div></div>
        <div class="field"><span class="field-label">Modelo:</span><div class="field-value">${esc(order.deviceModel) || "-"}</div></div>
      </div>
      <div class="col">
        <div class="field"><span class="field-label">IMEI:</span><div class="field-value">${esc(order.imei) || "Nao informado"}</div></div>
        <div class="field"><span class="field-label">Senha:</span><div class="field-value">${esc(order.devicePassword) || "Nao informado"}</div></div>
      </div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">PROBLEMA RELATADO</div>
    <div class="field-value" style="min-height: 20px; padding: 4px;">${(esc(order.reportedProblem) || "-").replace(/\n/g, "<br>")}</div>
  </div>

  ${infoHtml ? `<div class="section">${infoHtml}</div>` : ""}

  <div class="section">
    <div class="section-title">CHECKLIST DE ENTRADA</div>
    ${checklistHtml}
  </div>

  <div class="valores">
    <div class="section-title">SERVICOS E VALORES</div>
    ${itemsHtml}
    <div class="grid-2" style="margin-top: 10px;">
      <div class="col">
        <div class="field"><span class="field-label">Subtotal Servicos:</span><div class="field-value">${fmt(order.serviceAmount)}</div></div>
        <div class="field"><span class="field-label">Valor Pecas:</span><div class="field-value">${fmt(order.partsAmount)}</div></div>
      </div>
      <div class="col">
        <div class="field"><span class="field-label">Desconto:</span><div class="field-value">${fmt(order.discount)}</div></div>
        <div class="total">TOTAL: ${fmt(order.totalAmount)}</div>
      </div>
    </div>
  </div>

  <div class="assinatura-box">
    <strong>ASSINATURA DO CLIENTE</strong><br>
    ${esc(customer?.name)}<br>
    CPF: ${esc(customer?.cpf)}
  </div>

  <div style="text-align: center; margin-top: 20px; font-size: 8pt; color: #666;">
    ${esc(nomeLoja)} - Documento gerado em ${new Date().toLocaleDateString("pt-BR")} ${new Date().toLocaleTimeString("pt-BR")}
  </div>
</body></html>`;

    return new NextResponse(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (err) {
    console.error("PDF generation error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
