import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { withTenant, withAdmin } from "@/server/db";

/**
 * GET /api/pdv/[id]/termo-garantia
 *
 * Generates warranty term HTML — faithful to Laravel termo-garantia.blade.php.
 * Shows: store/customer info, products with warranty, terms & conditions, signatures.
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
            select: { name: true, cpf: true, phone: true },
          });
        })
      : null;

    const tenant = await withAdmin(async (tx) =>
      tx.tenant.findUnique({
        where: { id: tenantId },
        select: { name: true },
      })
    );

    const settings = await withTenant(tenantId, async (tx) =>
      tx.tenantSettings.findUnique({
        where: { tenantId },
        select: { tradeName: true, phone: true, address: true },
      })
    );

    const nomeLoja = settings?.tradeName ?? tenant?.name ?? "Arena Tech";
    const telefoneLoja = settings?.phone ?? "";
    const enderecoLoja =
      typeof settings?.address === "object" && settings?.address !== null
        ? formatAddress(settings.address as Record<string, unknown>)
        : "";

    const esc = (s: string | null | undefined) =>
      (s ?? "").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    const formatCpf = (cpf: string | null | undefined) => {
      if (!cpf || cpf.length !== 11) return cpf ?? "";
      return `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
    };

    const now = new Date();

    // Default warranty: 3 months
    const warrantyMonths = 3;
    const warrantyEnd = new Date(sale.saleDate);
    warrantyEnd.setMonth(warrantyEnd.getMonth() + warrantyMonths);

    // Items table rows
    let itemsHtml = "";
    for (const item of sale.items) {
      itemsHtml += `<tr>
        <td>${esc(item.description)}</td>
        <td>-</td>
        <td>Seminovo</td>
        <td>${warrantyMonths} meses</td>
      </tr>`;
    }

    const html = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8">
<title>Termo de Garantia - ${esc(sale.number)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 12px; line-height: 1.6; color: #1a1a1a; background: #f5f5f5; }
  .container { max-width: 800px; margin: 20px auto; background: #fff; padding: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
  .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 15px; margin-bottom: 20px; }
  .header h1 { font-size: 24px; margin-bottom: 5px; }
  .header p { color: #666; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
  .info-box { background: #f9f9f9; padding: 15px; border-radius: 5px; }
  .info-box h3 { font-size: 12px; color: #666; text-transform: uppercase; margin-bottom: 10px; border-bottom: 1px solid #ddd; padding-bottom: 5px; }
  .info-box p { margin-bottom: 5px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
  th { background: #f3f4f6; font-weight: bold; }
  .termos { margin: 20px 0; }
  .termos h3 { margin-bottom: 10px; }
  .termos ol { margin-left: 20px; }
  .termos li { margin-bottom: 8px; }
  .assinatura { margin-top: 40px; display: flex; justify-content: space-between; }
  .assinatura-box { width: 45%; text-align: center; }
  .assinatura-linha { border-top: 1px solid #333; margin-top: 50px; padding-top: 5px; }
  .footer { margin-top: 30px; text-align: center; color: #999; font-size: 10px; border-top: 1px solid #ddd; padding-top: 15px; }
  @media print { body { background: #fff; } .container { box-shadow: none; margin: 0; max-width: 100%; } .no-print { display: none; } }
</style>
</head><body>
  <div class="container">
    <div class="header">
      <h1>TERMO DE GARANTIA</h1>
      <p>${esc(sale.number)} | ${sale.saleDate.toLocaleDateString("pt-BR")}</p>
    </div>

    <div class="info-grid">
      <div class="info-box">
        <h3>Empresa</h3>
        <p><strong>${esc(nomeLoja)}</strong></p>
        ${enderecoLoja ? `<p>${esc(enderecoLoja)}</p>` : ""}
        ${telefoneLoja ? `<p>${esc(telefoneLoja)}</p>` : ""}
      </div>
      <div class="info-box">
        <h3>Cliente</h3>
        ${
          customer
            ? `<p><strong>${esc(customer.name)}</strong></p>
               ${customer.cpf ? `<p>CPF: ${formatCpf(customer.cpf)}</p>` : ""}
               ${customer.phone ? `<p>Tel: ${esc(customer.phone)}</p>` : ""}`
            : `<p>Cliente nao identificado</p>`
        }
      </div>
    </div>

    <h3>Produtos Adquiridos</h3>
    <table>
      <thead><tr>
        <th>Produto</th>
        <th>IMEI/Serie</th>
        <th>Condicao</th>
        <th>Garantia</th>
      </tr></thead>
      <tbody>${itemsHtml}</tbody>
    </table>

    <div class="termos">
      <h3>Termos e Condicoes da Garantia</h3>
      <ol>
        <li><strong>Prazo:</strong> A garantia de cada produto segue o prazo indicado na tabela acima, contado a partir da data da compra.</li>
        <li><strong>Cobertura:</strong> A garantia cobre defeitos de fabricacao e funcionamento. Nao cobre danos causados por mau uso, quedas, contato com liquidos, ou tentativas de reparo por terceiros.</li>
        <li><strong>Condicoes:</strong> Para acionar a garantia, o cliente deve apresentar este termo e o produto nas mesmas condicoes em que foi adquirido, sem sinais de violacao.</li>
        <li><strong>Exclusoes:</strong> Acessorios, baterias e pecas de desgaste natural nao estao cobertos por esta garantia.</li>
        <li><strong>Procedimento:</strong> Em caso de defeito, o cliente deve entrar em contato com nossa loja para avaliacao tecnica.</li>
        <li><strong>Prazo de Analise:</strong> A analise tecnica sera realizada em ate 30 dias uteis.</li>
        <li><strong>Produtos Seminovos:</strong> Produtos nesta condicao podem apresentar sinais de uso normal e nao caracterizam defeito.</li>
      </ol>
    </div>

    <p style="margin: 20px 0;">
      <strong>Validade Maxima da Garantia:</strong> de ${now.toLocaleDateString("pt-BR")} ate ${warrantyEnd.toLocaleDateString("pt-BR")}
    </p>

    <div class="assinatura">
      <div class="assinatura-box">
        <div class="assinatura-linha">${esc(nomeLoja)}</div>
      </div>
      <div class="assinatura-box">
        <div class="assinatura-linha">${esc(customer?.name ?? "Cliente")}</div>
      </div>
    </div>

    <div class="footer">
      <p>Documento gerado em ${now.toLocaleDateString("pt-BR")} ${now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</p>
    </div>

    <div class="no-print" style="text-align: center; margin-top: 20px;">
      <button onclick="window.print()" style="padding: 10px 30px; font-size: 14px; cursor: pointer;">Imprimir</button>
    </div>
  </div>
</body></html>`;

    return new NextResponse(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (err) {
    console.error("Warranty term generation error:", err);
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
