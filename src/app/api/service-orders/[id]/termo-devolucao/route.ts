import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { withTenant, withAdmin } from "@/server/db";

/**
 * GET /api/service-orders/[id]/termo-devolucao
 *
 * Termo de Devolucao — FAITHFUL to Laravel. Orange (#FF6B35) theme.
 * Confirms client received equipment back WITHOUT service being performed.
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
      return tx.serviceOrder.findUnique({ where: { id } });
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

    const esc = (s: string | null | undefined) => (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const now = new Date();

    const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<title>Termo de Devolucao - ${esc(order.number)}</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 11pt; margin: 20px; }
  .cabecalho { border-bottom: 3px solid #FF6B35; padding-bottom: 15px; margin-bottom: 20px; }
  .titulo-doc { text-align: center; font-size: 18pt; font-weight: bold; margin: 20px 0; color: #333; }
  .info-box { background: #f5f5f5; border-left: 4px solid #FF6B35; padding: 15px; margin: 15px 0; }
  .info-row { margin: 8px 0; }
  .label { font-weight: bold; color: #555; }
  .equipamento-box { border: 2px solid #ddd; border-radius: 8px; padding: 15px; margin: 20px 0; background: #fafafa; }
  .equipamento-titulo { font-size: 14pt; font-weight: bold; color: #FF6B35; margin-bottom: 10px; }
  .texto-termo { text-align: justify; line-height: 1.8; margin: 20px 0; }
  .assinatura { margin-top: 60px; text-align: center; }
  .linha-assinatura { border-top: 2px solid #000; width: 400px; margin: 0 auto; padding-top: 5px; font-weight: bold; }
  .rodape { position: fixed; bottom: 20px; left: 20px; right: 20px; text-align: center; font-size: 8pt; color: #999; border-top: 1px solid #ddd; padding-top: 10px; }
  @media print { body { margin: 0; } }
</style>
</head><body>
  <div class="cabecalho">
    <table style="width: 100%; border: none;"><tr>
      <td style="vertical-align: middle;">
        <div style="font-size: 11pt; font-weight: bold; color: #FF6B35;">${esc(nomeLoja)}${cnpjLoja ? ` - CNPJ: ${esc(cnpjLoja)}` : ""}</div>
        <div style="font-size: 9pt; color: #666;">Assistencia Tecnica Especializada</div>
        ${telefoneLoja ? `<div style="font-size: 9pt; color: #666;">${esc(telefoneLoja)}</div>` : ""}
      </td>
    </tr></table>
  </div>

  <div class="titulo-doc">TERMO DE DEVOLUCAO DE EQUIPAMENTO</div>

  <div class="info-box">
    <div class="info-row"><span class="label">Ordem de Servico:</span> ${esc(order.number)}</div>
    <div class="info-row"><span class="label">Data de Devolucao:</span> ${now.toLocaleDateString("pt-BR")} ${now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</div>
    <div class="info-row"><span class="label">Cliente:</span> ${esc(customer?.name)}</div>
    <div class="info-row"><span class="label">CPF:</span> ${esc(customer?.cpf)}</div>
    <div class="info-row"><span class="label">Telefone:</span> ${esc(customer?.phone)}</div>
  </div>

  <div class="equipamento-box">
    <div class="equipamento-titulo">DADOS DO EQUIPAMENTO DEVOLVIDO</div>
    <div class="info-row"><span class="label">Tipo:</span> ${esc(order.deviceType) || "Nao informado"}</div>
    ${order.deviceModel ? `<div class="info-row"><span class="label">Modelo:</span> ${esc(order.deviceModel)}</div>` : ""}
    ${order.imei ? `<div class="info-row"><span class="label">IMEI/Serie:</span> ${esc(order.imei)}</div>` : ""}
  </div>

  <div class="texto-termo">
    <p>Declaro ter recebido o equipamento acima descrito, devolvido nas mesmas condicoes
    em que foi entregue para analise/reparo, conforme Ordem de Servico
    <strong>${esc(order.number)}</strong>.</p>

    <p>Estou ciente de que o equipamento foi devolvido sem a realizacao do servico solicitado,
    seja por motivo de cancelamento, nao aprovacao do orcamento, ou outro motivo acordado entre as partes.</p>

    <p>Declaro que conferi o equipamento e seus acessorios (se houver) e os recebi em perfeito estado,
    nao tendo nenhuma reclamacao a fazer neste momento.</p>
  </div>

  <div class="assinatura">
    <div class="linha-assinatura">Assinatura do Cliente</div>
    <p style="font-size: 9pt; color: #666; margin-top: 5px;">
      ${esc(customer?.name)}<br>
      CPF: ${esc(customer?.cpf)}
    </p>
  </div>

  <div class="rodape">
    Documento gerado em ${now.toLocaleDateString("pt-BR")} ${now.toLocaleTimeString("pt-BR")} - OS: ${esc(order.number)}
  </div>
</body></html>`;

    return new NextResponse(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (err) {
    console.error("Termo devolucao error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
