import { SaleReceiptPdfDocument, type SaleReceiptPdfData } from "@/lib/pdf/sale-receipt-pdf";
import { renderPdfToBuffer } from "@/lib/pdf/render";
import { withAdmin, withTenant } from "@/server/db";
import { formatCnpj, formatCpf } from "@/lib/utils";

/**
 * Gera o PDF binario do recibo de venda. Usado tanto pela rota HTTP publica
 * (whatsapp-media) quanto por procedures tRPC (sendReceipt) que precisam
 * do buffer direto.
 */
export async function buildSaleReceiptPdf(
  tenantId: string,
  saleId: string,
): Promise<Buffer | null> {
  const sale = await withTenant(tenantId, async (tx) =>
    tx.sale.findUnique({
      where: { id: saleId },
      include: { items: { orderBy: { createdAt: "asc" } } },
    }),
  );
  if (!sale || sale.deletedAt) return null;

  const customer = sale.customerId
    ? await withTenant(tenantId, async (tx) =>
        tx.customer.findUnique({
          where: { id: sale.customerId! },
          select: { name: true, cpf: true, phone: true },
        }),
      )
    : null;

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

  const data: SaleReceiptPdfData = {
    sale: {
      number: sale.number,
      saleDate: sale.saleDate,
      totalAmount: sale.totalAmount,
      discountAmount: sale.discountAmount,
      paidAmount: sale.paidAmount,
      changeAmount: sale.changeAmount,
      paymentDetails: sale.paymentDetails,
      observations: sale.observations,
      items: sale.items.map((it) => ({
        description: it.description,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        total: it.total,
      })),
    },
    customer: customer
      ? { name: customer.name, cpf: formatCpf(customer.cpf) || null, phone: customer.phone }
      : null,
    store: {
      name: settings?.tradeName ?? tenant?.name ?? "ARENA TECH",
      cnpj: formatCnpj(settings?.cnpj ?? tenant?.cnpj ?? ""),
      phone: settings?.phone ?? "",
      logoUrl: settings?.logoUrl ?? null,
    },
  };

  return renderPdfToBuffer(SaleReceiptPdfDocument(data));
}
