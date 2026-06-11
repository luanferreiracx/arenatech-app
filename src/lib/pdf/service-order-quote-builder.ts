import {
  ServiceOrderQuotePdfDocument,
  type QuoteSnapshotItem,
  type ServiceOrderQuotePdfData,
} from "@/lib/pdf/service-order-quote-pdf";
import { renderPdfToBuffer } from "@/lib/pdf/render";
import { withAdmin, withTenant } from "@/server/db";
import { formatCpf } from "@/lib/utils";
import { getAppBaseUrl } from "@/lib/utils/app-url";

/**
 * Builda o PDF do orcamento adicional (revisao de orcamento da OS).
 *
 * Paridade Laravel `OrdemServicoPdfController::gerarPdfOrcamento`. Carrega
 * o quote pendente/aprovado/rejeitado mais recente da OS e renderiza
 * comparacao previous vs new + motivo + bloco de aprovacao.
 *
 * Usado tanto pela rota HTTP (download direto pelo operador) quanto pela
 * rota publica `/api/whatsapp-media/os-quote/pdf/[token]` (anexo no
 * `requestBudgetApproval` enviado ao cliente via WhatsApp).
 */
export async function buildServiceOrderQuotePdf(
  tenantId: string,
  orderId: string,
): Promise<Buffer | null> {
  const order = await withTenant(tenantId, async (tx) =>
    tx.serviceOrder.findUnique({
      where: { id: orderId },
      include: {
        quotes: { orderBy: { createdAt: "desc" }, take: 1 },
        items: { orderBy: { createdAt: "asc" } },
      },
    }),
  );
  if (!order || order.deletedAt) return null;

  const quote = order.quotes[0];
  if (!quote) return null;

  const customer = await withTenant(tenantId, async (tx) =>
    tx.customer.findUnique({
      where: { id: order.customerId },
      select: { name: true, cpf: true, phone: true },
    }),
  );

  const [tenant, settings] = await Promise.all([
    withAdmin(async (tx) =>
      tx.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
    ),
    withTenant(tenantId, async (tx) =>
      tx.tenantSettings.findUnique({
        where: { tenantId },
        select: { tradeName: true, phone: true, logoUrl: true },
      }),
    ),
  ]);

  const appUrl = getAppBaseUrl();
  const approvalLinkUrl = `${appUrl}/quote/${quote.approvalLink}`;

  // Snapshots de itens: previous = estado pre-revisao (snapshot tirado quando
  // a revisao foi iniciada); new = snapshot enviado ao cliente (ou os itens
  // atuais da OS, que sao a fonte da verdade).
  const previousItems = (quote.previousItemsSnapshot ?? []) as unknown as QuoteSnapshotItem[];
  const newItems = (quote.newItemsSnapshot ?? order.items.map((i) => ({
    description: i.description,
    quantity: Number(i.quantity),
    total: Math.round(Number(i.total) * 100),
  }))) as unknown as QuoteSnapshotItem[];

  const data: ServiceOrderQuotePdfData = {
    store: {
      name: settings?.tradeName ?? tenant?.name ?? "ARENA TECH",
      phone: settings?.phone ?? "",
      logoUrl: settings?.logoUrl ?? null,
    },
    order: {
      number: order.number,
      deviceType: order.deviceType,
      deviceModel: order.deviceModel,
      imei: order.imei,
    },
    customer: customer
      ? {
          name: customer.name,
          cpf: formatCpf(customer.cpf) || null,
          phone: customer.phone,
        }
      : null,
    quote: {
      reason: quote.reason,
      additionalServices: quote.additionalServices,
      status: quote.status as "pending" | "approved" | "rejected",
      createdAt: quote.createdAt,
      approvedAt: quote.approvedAt,
      rejectedAt: quote.rejectedAt,
      approvalLink: quote.approvalLink,
      previousServiceAmount: Number(quote.previousServiceAmount),
      previousPartsAmount: Number(quote.previousPartsAmount),
      previousDiscount: Number(quote.previousDiscount),
      previousTotal: Number(quote.previousTotal),
      newServiceAmount: Number(quote.newServiceAmount),
      newPartsAmount: Number(quote.newPartsAmount),
      newDiscount: Number(quote.newDiscount),
      newTotal: Number(quote.newTotal),
      previousItems,
      newItems,
    },
    approvalLinkUrl,
  };

  return renderPdfToBuffer(ServiceOrderQuotePdfDocument(data));
}
