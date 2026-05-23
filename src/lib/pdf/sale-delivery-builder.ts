import { SaleDeliveryPdfDocument, type SaleDeliveryPdfData } from "@/lib/pdf/sale-delivery-pdf";
import { renderPdfToBuffer } from "@/lib/pdf/render";
import { withTenant } from "@/server/db";
import { formatCpf } from "@/lib/utils";
import { loadTenantHeader, formatDoc } from "@/lib/pdf/tenant-header";

/**
 * Gera o PDF binario do termo de entrega da venda. Paridade visual com
 * Laravel intranetpdv `termo-entrega.blade.php`: header com logo e divisor
 * dourado, info-table compacta do cliente, tabela de aparelhos com IMEI em
 * highlight amarelo, declaracao verde, box ambar quando ha quitacao de
 * diferenca (downgrade), assinatura unica do cliente com fallback Autentique.
 */
export async function buildSaleDeliveryPdf(
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
          select: {
            name: true,
            cpf: true,
            phone: true,
            street: true,
            streetNumber: true,
            neighborhood: true,
            city: true,
            state: true,
          },
        }),
      )
    : null;

  // Stock items + product info para filtrar so aparelhos (isDevice).
  const stockItemIds = sale.items.map((it) => it.stockItemId).filter((v): v is string => !!v);
  const stockItems = stockItemIds.length
    ? await withTenant(tenantId, async (tx) =>
        tx.stockItem.findMany({
          where: { id: { in: stockItemIds } },
          select: {
            id: true,
            imei: true,
            serialNumber: true,
            condition: true,
          },
        }),
      )
    : [];
  const stockItemMap = new Map(stockItems.map((si) => [si.id, si]));

  const productIds = sale.items.map((it) => it.productId);
  const products = productIds.length
    ? await withTenant(tenantId, async (tx) =>
        tx.product.findMany({
          where: { id: { in: productIds } },
          select: { id: true, isDevice: true },
        }),
      )
    : [];
  const productMap = new Map(products.map((p) => [p.id, p]));

  const deviceItems = sale.items
    .filter((it) => productMap.get(it.productId)?.isDevice)
    .map((it) => {
      const si = it.stockItemId ? stockItemMap.get(it.stockItemId) : null;
      return {
        description: it.description,
        imei: si?.imei ?? null,
        serial: si?.serialNumber ?? null,
        condition: si?.condition ?? null,
      };
    });

  const header = await loadTenantHeader(tenantId);

  const customerAddress = customer
    ? [
        customer.street,
        customer.streetNumber,
        customer.neighborhood,
        customer.city,
        customer.state,
      ]
        .filter(Boolean)
        .join(", ") || null
    : null;

  const data: SaleDeliveryPdfData = {
    sale: {
      number: sale.number,
      saleDate: sale.saleDate,
      refundDueAmount: sale.refundDueAmount,
      refundDueMethod: sale.refundDueMethod,
      signedViaAutentique: !!sale.signatureSignedAt && !sale.physicalSignature,
      deviceItems,
    },
    customer: customer
      ? {
          name: customer.name,
          cpf: formatCpf(customer.cpf) || null,
          phone: customer.phone,
          address: customerAddress,
        }
      : null,
    store: {
      name: header.storeName,
      cnpj: formatDoc(header.cnpj),
      phone: header.phone,
      address: header.address,
      logoDataUrl: header.logoDataUrl,
    },
  };

  return renderPdfToBuffer(SaleDeliveryPdfDocument(data));
}
