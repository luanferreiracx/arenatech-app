import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { withTenant } from "@/server/db";
import { withAdmin } from "@/server/db";

/**
 * GET /api/service-orders/[id]/pdf
 *
 * Generates a simple HTML-based PDF for the service order.
 * Returns an HTML page with print-optimized styles that can be
 * printed to PDF via the browser's print dialog (Cmd+P / Ctrl+P).
 *
 * A full server-side PDF generation (via puppeteer or react-pdf)
 * can be added later. For now, this "print-friendly" approach
 * covers the core requirement.
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

  // Resolve tenant from cookie
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
          items: { orderBy: { createdAt: "asc" } },
        },
      });
    });

    if (!order || order.deletedAt) {
      return NextResponse.json({ error: "OS not found" }, { status: 404 });
    }

    // Load customer
    const customer = await withTenant(tenantId, async (tx) => {
      return tx.customer.findUnique({
        where: { id: order.customerId },
        select: { name: true, cpf: true, phone: true, email: true },
      });
    });

    // Load tenant info
    const tenant = await withAdmin(async (tx) => {
      return tx.tenant.findUnique({
        where: { id: tenantId },
        select: { name: true, cnpj: true },
      });
    });

    // Load user names
    const userIds = [order.createdById, order.technicianId, order.vendorId].filter(Boolean) as string[];
    const users = await withAdmin(async (tx) => {
      return tx.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true },
      });
    });
    const userMap = new Map(users.map((u) => [u.id, u.name]));

    const formatMoney = (v: unknown) => {
      const num = Number(v ?? 0);
      return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    };

    const formatDate = (d: Date | null) => {
      if (!d) return "—";
      return new Date(d).toLocaleDateString("pt-BR");
    };

    const STATUS_LABELS: Record<string, string> = {
      OPEN: "Iniciada", IN_DIAGNOSIS: "Em Diagnostico", WAITING_APPROVAL: "Aguard. Aprovacao",
      APPROVED: "Aprovada", WAITING_PARTS: "Aguard. Pecas", IN_PROGRESS: "Em Execucao",
      COMPLETED: "Concluida", PAID: "Paga", READY_FOR_PICKUP: "Aguard. Retirada",
      DELIVERED: "Entregue", IN_WARRANTY: "Em Garantia", CANCELLED: "Cancelada", REFUNDED: "Estornada",
    };

    const itemsHtml = order.items.map((item) => `
      <tr>
        <td>${item.type === "SERVICE" ? "Servico" : "Produto"}</td>
        <td>${item.description}</td>
        <td style="text-align:center">${Number(item.quantity)}</td>
        <td style="text-align:right">${formatMoney(item.unitPrice)}</td>
        <td style="text-align:right">${formatMoney(item.total)}</td>
      </tr>
    `).join("");

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>OS ${order.number} — ${tenant?.name ?? "Arena Tech"}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #333; padding: 20px; }
    .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #c9a55c; padding-bottom: 12px; margin-bottom: 16px; }
    .header h1 { font-size: 20px; color: #c9a55c; }
    .header .company { text-align: right; font-size: 11px; color: #666; }
    .section { margin-bottom: 16px; }
    .section h2 { font-size: 13px; font-weight: bold; color: #c9a55c; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; border-bottom: 1px solid #eee; padding-bottom: 4px; }
    .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
    .grid .item { }
    .grid .item label { display: block; font-size: 10px; color: #999; text-transform: uppercase; }
    .grid .item span { font-size: 12px; font-weight: 500; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    table th, table td { padding: 6px 8px; border: 1px solid #ddd; font-size: 11px; }
    table th { background: #f5f5f5; font-weight: 600; text-align: left; }
    .total-row td { font-weight: bold; border-top: 2px solid #c9a55c; }
    .footer { margin-top: 24px; text-align: center; font-size: 10px; color: #999; border-top: 1px solid #ddd; padding-top: 8px; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <div class="header">
    <h1>OS ${order.number}</h1>
    <div class="company">
      <strong>${tenant?.name ?? "Arena Tech"}</strong><br>
      ${tenant?.cnpj ? `CNPJ: ${tenant.cnpj}` : ""}
    </div>
  </div>

  <div class="section">
    <h2>Dados da OS</h2>
    <div class="grid">
      <div class="item"><label>Status</label><span>${STATUS_LABELS[order.status] ?? order.status}</span></div>
      <div class="item"><label>Data Entrada</label><span>${formatDate(order.entryDate)}</span></div>
      <div class="item"><label>Previsao</label><span>${formatDate(order.estimatedDate)}</span></div>
      <div class="item"><label>Tecnico</label><span>${order.technicianId ? userMap.get(order.technicianId) ?? "—" : "—"}</span></div>
    </div>
  </div>

  <div class="section">
    <h2>Cliente</h2>
    <div class="grid">
      <div class="item"><label>Nome</label><span>${customer?.name ?? "—"}</span></div>
      <div class="item"><label>CPF</label><span>${customer?.cpf ?? "—"}</span></div>
      <div class="item"><label>Telefone</label><span>${customer?.phone ?? "—"}</span></div>
      <div class="item"><label>Email</label><span>${customer?.email ?? "—"}</span></div>
    </div>
  </div>

  <div class="section">
    <h2>Equipamento</h2>
    <div class="grid">
      <div class="item"><label>Tipo</label><span>${order.deviceType ?? "—"}</span></div>
      <div class="item"><label>Modelo</label><span>${order.deviceModel ?? "—"}</span></div>
      <div class="item"><label>IMEI/Serial</label><span>${order.imei ?? order.serialNumber ?? "—"}</span></div>
      <div class="item"><label>Senha</label><span>${order.devicePassword ?? "—"}</span></div>
    </div>
  </div>

  <div class="section">
    <h2>Problema</h2>
    <p>${order.reportedProblem ?? "—"}</p>
    ${order.diagnosedProblem ? `<p style="margin-top:8px"><strong>Diagnostico:</strong> ${order.diagnosedProblem}</p>` : ""}
  </div>

  <div class="section">
    <h2>Itens</h2>
    <table>
      <thead>
        <tr><th>Tipo</th><th>Descricao</th><th style="text-align:center">Qtd</th><th style="text-align:right">Unit.</th><th style="text-align:right">Total</th></tr>
      </thead>
      <tbody>
        ${itemsHtml}
        <tr class="total-row">
          <td colspan="4" style="text-align:right">TOTAL</td>
          <td style="text-align:right">${formatMoney(order.totalAmount)}</td>
        </tr>
      </tbody>
    </table>
  </div>

  ${order.paymentMethod ? `
  <div class="section">
    <h2>Pagamento</h2>
    <div class="grid">
      <div class="item"><label>Forma</label><span>${order.paymentMethod}</span></div>
      <div class="item"><label>Valor Pago</label><span>${formatMoney(order.paidAmount)}</span></div>
      <div class="item"><label>Data Pagamento</label><span>${formatDate(order.paymentDate)}</span></div>
    </div>
  </div>` : ""}

  ${order.vendorId ? `
  <div class="section">
    <h2>Vendedor</h2>
    <p>${userMap.get(order.vendorId) ?? "—"}</p>
  </div>` : ""}

  ${order.nfseIssued ? `
  <div class="section">
    <h2>NFS-e</h2>
    <p>Emitida${order.nfseNumber ? ` — Numero: ${order.nfseNumber}` : ""}</p>
  </div>` : ""}

  <div class="section">
    <h2>Garantia</h2>
    <p>${order.warrantyMonths} meses${order.isWarranty ? " (OS de garantia)" : ""}</p>
  </div>

  <div class="footer">
    ${tenant?.name ?? "Arena Tech"} — Documento gerado em ${new Date().toLocaleDateString("pt-BR")} ${new Date().toLocaleTimeString("pt-BR")}
  </div>
</body>
</html>`;

    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
      },
    });
  } catch (err) {
    console.error("PDF generation error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
