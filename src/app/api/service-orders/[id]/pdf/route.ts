import { NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { withTenant } from "@/server/db";
import { cookies } from "next/headers";
import { z } from "zod";
import { withAdmin } from "@/server/db";

const uuidSchema = z.string().uuid();

function formatMoney(value: unknown): string {
  return Number(value).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "-";
  return new Date(date).toLocaleDateString("pt-BR");
}

function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return "-";
  return new Date(date).toLocaleString("pt-BR");
}

const STATUS_LABELS: Record<string, string> = {
  OPEN: "Aberta",
  IN_DIAGNOSIS: "Em Diagnostico",
  WAITING_APPROVAL: "Aguardando Aprovacao",
  APPROVED: "Aprovada",
  WAITING_PARTS: "Aguardando Pecas",
  IN_PROGRESS: "Em Andamento",
  COMPLETED: "Concluida",
  PAID: "Paga",
  READY_FOR_PICKUP: "Pronta p/ Retirada",
  DELIVERED: "Entregue",
  IN_WARRANTY: "Em Garantia",
  CANCELLED: "Cancelada",
  REFUNDED: "Estornada",
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const cookieStore = await cookies();
  const tenantId = cookieStore.get("x-active-tenant")?.value ?? session.activeTenantId;
  if (!tenantId || !uuidSchema.safeParse(tenantId).success) {
    return NextResponse.json({ error: "No active tenant" }, { status: 403 });
  }

  // Validate tenant access
  const hasTenant = session.availableTenants.some((t) => t.id === tenantId);
  if (!hasTenant && !session.user.isSuperAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const order = await withTenant(tenantId, async (tx) => {
      return tx.serviceOrder.findFirst({
        where: { id, deletedAt: null },
        include: {
          items: { orderBy: { createdAt: "asc" } },
        },
      });
    });

    if (!order) {
      return NextResponse.json({ error: "OS nao encontrada" }, { status: 404 });
    }

    // Fetch customer
    const customer = await withTenant(tenantId, async (tx) => {
      return tx.customer.findFirst({
        where: { id: order.customerId },
        select: { name: true, cpf: true, cnpj: true, phone: true, email: true, type: true, address: true },
      });
    });

    // Fetch tenant settings for header
    const tenantSettings = await withTenant(tenantId, async (tx) => {
      return tx.tenantSettings.findUnique({ where: { tenantId } });
    });

    // Fetch user names
    const userIds = [order.createdById, order.technicianId].filter((uid): uid is string => !!uid);
    const users = userIds.length > 0
      ? await withAdmin(async (tx) => tx.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }))
      : [];
    const userMap = new Map(users.map((u) => [u.id, u.name]));

    const address = customer?.address as Record<string, string> | null;
    const checklist = order.entryChecklist as Record<string, boolean | null> | null;
    const deviceInfo = order.deviceInfo as Record<string, boolean> | null;

    const html = buildHtml({
      tenantName: tenantSettings?.tradeName ?? "Arena Tech",
      tenantCnpj: tenantSettings?.cnpj ?? null,
      tenantPhone: tenantSettings?.phone ?? null,
      tenantEmail: tenantSettings?.email ?? null,
      tenantAddress: tenantSettings?.address as Record<string, string> | null,
      number: order.number,
      status: STATUS_LABELS[order.status] ?? order.status,
      entryDate: formatDate(order.entryDate),
      entryDateTime: formatDateTime(order.entryDate),
      estimatedDate: formatDate(order.estimatedDate),
      completedDate: formatDate(order.completedDate),
      deliveredDate: formatDate(order.deliveredDate),
      customerName: customer?.name ?? "-",
      customerCpf: customer?.cpf ?? null,
      customerCnpj: customer?.cnpj ?? null,
      customerPhone: customer?.phone ?? null,
      customerEmail: customer?.email ?? null,
      customerAddress: address,
      deviceType: order.deviceType,
      deviceBrand: order.deviceBrand,
      deviceModel: order.deviceModel,
      serialNumber: order.serialNumber,
      imei: order.imei,
      devicePassword: order.devicePassword,
      accessories: order.accessories,
      reportedProblem: order.reportedProblem,
      diagnosedProblem: order.diagnosedProblem,
      entryChecklist: checklist,
      deviceInfo,
      items: order.items.map((item) => ({
        type: item.type === "SERVICE" ? "Servico" : "Produto",
        description: item.description,
        quantity: Number(item.quantity),
        unitPrice: formatMoney(item.unitPrice),
        total: formatMoney(item.total),
      })),
      serviceAmount: formatMoney(order.serviceAmount),
      partsAmount: formatMoney(order.partsAmount),
      discount: Number(order.discount) > 0 ? formatMoney(order.discount) : null,
      totalAmount: formatMoney(order.totalAmount),
      technicianName: order.technicianId ? (userMap.get(order.technicianId) ?? "-") : null,
      createdByName: userMap.get(order.createdById) ?? "-",
      internalNotes: order.internalNotes,
      customerNotes: order.customerNotes,
      isWarranty: order.isWarranty,
      warrantyType: order.warrantyType,
      warrantyMonths: order.warrantyMonths,
    });

    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
      },
    });
  } catch (error) {
    console.error("PDF route error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

interface PdfTemplateData {
  tenantName: string;
  tenantCnpj: string | null;
  tenantPhone: string | null;
  tenantEmail: string | null;
  tenantAddress: Record<string, string> | null;
  number: string;
  status: string;
  entryDate: string;
  entryDateTime: string;
  estimatedDate: string;
  completedDate: string;
  deliveredDate: string;
  customerName: string;
  customerCpf: string | null;
  customerCnpj: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  customerAddress: Record<string, string> | null;
  deviceType: string | null;
  deviceBrand: string | null;
  deviceModel: string | null;
  serialNumber: string | null;
  imei: string | null;
  devicePassword: string | null;
  accessories: string | null;
  reportedProblem: string | null;
  diagnosedProblem: string | null;
  entryChecklist: Record<string, boolean | null> | null;
  deviceInfo: Record<string, boolean> | null;
  items: Array<{
    type: string;
    description: string;
    quantity: number;
    unitPrice: string;
    total: string;
  }>;
  serviceAmount: string;
  partsAmount: string;
  discount: string | null;
  totalAmount: string;
  technicianName: string | null;
  createdByName: string;
  internalNotes: string | null;
  customerNotes: string | null;
  isWarranty: boolean;
  warrantyType: string | null;
  warrantyMonths: number | null;
}

// Checklist key → human-readable label (matches CHECKLIST_LABELS in validators)
const CHECKLIST_KEY_LABELS: Record<string, string> = {
  powerOn: "Aparelho liga",
  vibration: "Aparelho vibra",
  buttons: "Botoes OK",
  bluetooth: "Bluetooth OK",
  wifi: "WiFi OK",
  backGlass: "Vidro traseiro OK",
  audio: "Audio OK",
  microphone: "Microfone OK",
  cameras: "Cameras/Flash OK",
  touchFaceId: "Touch/FaceID OK",
  charging: "Aparelho carrega",
  screen: "Tela frontal OK",
  cableCharging: "Carregamento cabo",
  wirelessCharging: "Carregamento inducao",
  magSafe: "Ima/MagSafe",
};

const DEVICE_INFO_KEY_LABELS: Record<string, string> = {
  waterDamage: "Aparelho molhou",
  noOriginalCharger: "Nao usa fonte original",
  dropDamage: "Aparelho sofreu queda",
  hiddenProblems: "Problemas ocultos",
  recentOtherRepair: "Outra assistencia recente",
  simChipReturned: "Acessorios/chip devolvidos",
};

const WARRANTY_TYPE_LABELS: Record<string, string> = {
  retorno_servico: "Retorno de Servico",
  produto_vendido: "Produto Vendido",
  fabricante: "Fabricante",
};

function esc(str: string | null | undefined): string {
  if (!str) return "";
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function formatChecklistValue(val: boolean | null | undefined): string {
  if (val === true) return "&#10003; Sim";
  if (val === false) return "&#10007; Nao";
  return "&#8212; N/A";
}

function formatChecklistClass(val: boolean | null | undefined): string {
  if (val === true) return "color:#16a34a;";
  if (val === false) return "color:#dc2626;";
  return "color:#888;";
}

function buildHtml(data: PdfTemplateData): string {
  const tenantAddr = data.tenantAddress;
  const tenantAddressLine = tenantAddr
    ? [tenantAddr.street, tenantAddr.number, tenantAddr.neighborhood, tenantAddr.city, tenantAddr.state].filter(Boolean).join(", ")
    : "";

  const custAddr = data.customerAddress;
  const custAddressLine = custAddr
    ? [custAddr.street, custAddr.number, custAddr.neighborhood, custAddr.city, custAddr.state, custAddr.zip].filter(Boolean).join(", ")
    : "";

  const itemsRows = data.items
    .map(
      (item) => `
      <tr>
        <td>${esc(item.type)}</td>
        <td>${esc(item.description)}</td>
        <td class="center">${item.quantity}</td>
        <td class="right">${esc(item.unitPrice)}</td>
        <td class="right">${esc(item.total)}</td>
      </tr>`,
    )
    .join("");

  // Build checklist HTML with proper labels and 3-state rendering
  const checklistHtml = data.entryChecklist
    ? Object.entries(CHECKLIST_KEY_LABELS)
        .map(([key, label]) => {
          const val = data.entryChecklist?.[key];
          if (val === undefined) return "";
          return `<span class="check-item" style="${formatChecklistClass(val)}">${formatChecklistValue(val)} ${esc(label)}</span>`;
        })
        .filter(Boolean)
        .join(" ")
    : "";

  // Build device info HTML
  const deviceInfoItems = data.deviceInfo
    ? Object.entries(DEVICE_INFO_KEY_LABELS)
        .filter(([key]) => data.deviceInfo?.[key])
        .map(([, label]) => label)
    : [];

  // Build warranty text
  const warrantyText = data.isWarranty
    ? `${WARRANTY_TYPE_LABELS[data.warrantyType ?? ""] ?? data.warrantyType ?? "N/A"} — ${data.warrantyMonths ?? 3} meses`
    : null;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>OS ${esc(data.number)} - ${esc(data.tenantName)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 12px; color: #333; padding: 20px; max-width: 800px; margin: 0 auto; }
    @media print {
      body { padding: 0; font-size: 11px; }
      .no-print { display: none !important; }
      @page { margin: 15mm; size: A4; }
    }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #c9a55c; padding-bottom: 12px; margin-bottom: 16px; }
    .header h1 { font-size: 22px; color: #c9a55c; margin-bottom: 2px; }
    .header .subtitle { font-size: 10px; color: #888; }
    .header .company-info { font-size: 11px; color: #666; }
    .header .os-info { text-align: right; }
    .header .os-number { font-size: 18px; font-weight: bold; font-family: monospace; }
    .header .os-status { display: inline-block; background: #c9a55c; color: #fff; padding: 2px 10px; border-radius: 4px; font-size: 11px; font-weight: 600; margin-top: 4px; }
    .section { margin-bottom: 14px; page-break-inside: avoid; }
    .section-title { font-size: 13px; font-weight: 600; color: #c9a55c; border-bottom: 1px solid #eee; padding-bottom: 4px; margin-bottom: 8px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 16px; }
    .grid .label { color: #888; font-size: 11px; }
    .grid .value { font-weight: 500; }
    table { width: 100%; border-collapse: collapse; margin-top: 6px; }
    th { background: #f5f5f5; text-align: left; padding: 6px 8px; font-size: 11px; border-bottom: 1px solid #ddd; }
    td { padding: 5px 8px; border-bottom: 1px solid #eee; font-size: 11px; }
    .right { text-align: right; }
    .center { text-align: center; }
    .totals { margin-top: 8px; text-align: right; }
    .totals .row { display: flex; justify-content: flex-end; gap: 24px; padding: 2px 8px; }
    .totals .total-final { font-size: 14px; font-weight: 700; border-top: 2px solid #c9a55c; padding-top: 4px; }
    .notes { background: #fafafa; border: 1px solid #eee; border-radius: 4px; padding: 8px; margin-top: 6px; white-space: pre-line; font-size: 11px; }
    .check-item { display: inline-block; margin-right: 10px; font-size: 11px; }
    .info-alert { display: inline-block; background: #fff3e0; border: 1px solid #ffe0b2; border-radius: 3px; padding: 2px 6px; margin: 2px; font-size: 10px; color: #e65100; }
    .warranty-box { background: #e8f5e9; border: 1px solid #a5d6a7; border-radius: 4px; padding: 8px; margin-top: 6px; font-size: 11px; }
    .footer { margin-top: 32px; border-top: 1px solid #ddd; padding-top: 12px; }
    .signature-block { display: inline-block; width: 280px; text-align: center; margin: 0 20px; }
    .signature-line { border-top: 1px solid #333; padding-top: 4px; font-size: 10px; color: #666; margin-top: 40px; }
    .signature-name { font-size: 9px; color: #999; margin-top: 2px; }
    .print-btn { position: fixed; top: 16px; right: 16px; background: #c9a55c; color: #fff; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 600; }
    .print-btn:hover { background: #b08e4a; }
  </style>
</head>
<body>
  <button class="print-btn no-print" onclick="window.print()">Imprimir / Salvar PDF</button>

  <div class="header">
    <div>
      <h1>${esc(data.tenantName)}</h1>
      <div class="subtitle">Assistencia Tecnica Especializada</div>
      <div class="company-info">
        ${data.tenantCnpj ? `CNPJ: ${esc(data.tenantCnpj)}<br/>` : ""}
        ${data.tenantPhone ? `Tel: ${esc(data.tenantPhone)}` : ""}${data.tenantEmail ? ` | ${esc(data.tenantEmail)}` : ""}
        ${tenantAddressLine ? `<br/>${esc(tenantAddressLine)}` : ""}
      </div>
    </div>
    <div class="os-info">
      <div class="os-number">${esc(data.number)}</div>
      <span class="os-status">${esc(data.status)}</span>
      <div style="margin-top:6px; font-size:11px; color:#666;">
        Entrada: ${esc(data.entryDateTime)}
        ${data.estimatedDate !== "-" ? `<br/>Previsao: ${esc(data.estimatedDate)}` : ""}
      </div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Dados do Cliente</div>
    <div class="grid">
      <div><span class="label">Nome:</span> <span class="value">${esc(data.customerName)}</span></div>
      ${data.customerCpf ? `<div><span class="label">CPF:</span> <span class="value">${esc(data.customerCpf)}</span></div>` : ""}
      ${data.customerCnpj ? `<div><span class="label">CNPJ:</span> <span class="value">${esc(data.customerCnpj)}</span></div>` : ""}
      ${data.customerPhone ? `<div><span class="label">Telefone:</span> <span class="value">${esc(data.customerPhone)}</span></div>` : ""}
      ${data.customerEmail ? `<div><span class="label">E-mail:</span> <span class="value">${esc(data.customerEmail)}</span></div>` : ""}
      ${custAddressLine ? `<div style="grid-column:1/-1;"><span class="label">Endereco:</span> <span class="value">${esc(custAddressLine)}</span></div>` : ""}
    </div>
  </div>

  <div class="section">
    <div class="section-title">Dados do Equipamento</div>
    <div class="grid">
      ${data.deviceType ? `<div><span class="label">Tipo:</span> <span class="value">${esc(data.deviceType)}</span></div>` : ""}
      ${data.deviceBrand ? `<div><span class="label">Marca:</span> <span class="value">${esc(data.deviceBrand)}</span></div>` : ""}
      ${data.deviceModel ? `<div><span class="label">Modelo:</span> <span class="value">${esc(data.deviceModel)}</span></div>` : ""}
      ${data.serialNumber ? `<div><span class="label">Serial:</span> <span class="value">${esc(data.serialNumber)}</span></div>` : ""}
      ${data.imei ? `<div><span class="label">IMEI:</span> <span class="value">${esc(data.imei)}</span></div>` : ""}
      ${data.devicePassword ? `<div><span class="label">Senha:</span> <span class="value">${esc(data.devicePassword)}</span></div>` : ""}
      ${data.accessories ? `<div style="grid-column:1/-1;"><span class="label">Acessorios:</span> <span class="value">${esc(data.accessories)}</span></div>` : ""}
    </div>
  </div>

  ${data.reportedProblem || data.diagnosedProblem ? `
  <div class="section">
    <div class="section-title">Problema</div>
    ${data.reportedProblem ? `<p style="margin-bottom:4px;"><strong>Relatado:</strong> ${esc(data.reportedProblem)}</p>` : ""}
    ${data.diagnosedProblem ? `<p><strong>Diagnosticado:</strong> ${esc(data.diagnosedProblem)}</p>` : ""}
  </div>` : ""}

  ${deviceInfoItems.length > 0 ? `
  <div class="section">
    <div class="section-title">Informacoes Adicionais</div>
    <div>${deviceInfoItems.map((info) => `<span class="info-alert">${esc(info)}</span>`).join(" ")}</div>
  </div>` : ""}

  ${checklistHtml ? `
  <div class="section">
    <div class="section-title">Checklist de Entrada</div>
    <div>${checklistHtml}</div>
  </div>` : ""}

  ${data.items.length > 0 ? `
  <div class="section">
    <div class="section-title">Servicos e Produtos</div>
    <table>
      <thead>
        <tr>
          <th>Tipo</th>
          <th>Descricao</th>
          <th class="center">Qtd</th>
          <th class="right">Unitario</th>
          <th class="right">Total</th>
        </tr>
      </thead>
      <tbody>${itemsRows}</tbody>
    </table>
    <div class="totals">
      <div class="row"><span class="label">Servicos:</span> <span>${esc(data.serviceAmount)}</span></div>
      <div class="row"><span class="label">Pecas:</span> <span>${esc(data.partsAmount)}</span></div>
      ${data.discount ? `<div class="row"><span class="label">Desconto:</span> <span>-${esc(data.discount)}</span></div>` : ""}
      <div class="row total-final"><span>TOTAL:</span> <span>${esc(data.totalAmount)}</span></div>
    </div>
  </div>` : ""}

  <div class="section">
    <div class="section-title">Responsaveis e Garantia</div>
    <div class="grid">
      <div><span class="label">Atendente:</span> <span class="value">${esc(data.createdByName)}</span></div>
      ${data.technicianName ? `<div><span class="label">Tecnico:</span> <span class="value">${esc(data.technicianName)}</span></div>` : ""}
    </div>
    ${warrantyText ? `<div class="warranty-box"><strong>Garantia:</strong> ${esc(warrantyText)}</div>` : ""}
  </div>

  ${data.internalNotes ? `
  <div class="section">
    <div class="section-title">Observacoes Internas</div>
    <div class="notes">${esc(data.internalNotes)}</div>
  </div>` : ""}

  ${data.customerNotes ? `
  <div class="section">
    <div class="section-title">Observacoes para o Cliente</div>
    <div class="notes">${esc(data.customerNotes)}</div>
  </div>` : ""}

  <div class="footer">
    <div style="display:flex; justify-content:space-around; margin-top:40px;">
      <div class="signature-block">
        <div class="signature-line">Responsavel Tecnico</div>
        ${data.technicianName ? `<div class="signature-name">${esc(data.technicianName)}</div>` : ""}
      </div>
      <div class="signature-block">
        <div class="signature-line">Cliente</div>
        <div class="signature-name">${esc(data.customerName)}${data.customerCpf ? `<br/>CPF: ${esc(data.customerCpf)}` : ""}</div>
      </div>
    </div>
    <p style="text-align:center; font-size:10px; color:#999; margin-top:16px;">
      Documento gerado em ${formatDateTime(new Date())} | ${esc(data.tenantName)}
    </p>
  </div>
</body>
</html>`;
}
