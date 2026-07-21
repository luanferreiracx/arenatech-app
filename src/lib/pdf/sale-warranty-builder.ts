import { SaleWarrantyPdfDocument, type SaleWarrantyPdfData } from "@/lib/pdf/sale-warranty-pdf";
import { renderPdfToBuffer } from "@/lib/pdf/render";
import { withTenant } from "@/server/db";
import { formatCustomerDocument } from "@/lib/utils";
import { loadTenantHeader, formatDoc } from "@/lib/pdf/tenant-header";

/**
 * Gera o PDF binario do termo de garantia da venda. Paridade visual com
 * Laravel intranetpdv `termo-garantia.blade.php`: header dourado Arena Tech,
 * info-cards de Empresa + Cliente (border-left dourada), tabela de produtos
 * com header preto-noite, box verde de validade maxima, 7 termos numerados,
 * assinaturas duplas empresa+cliente.
 */
export async function buildSaleWarrantyPdf(
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
          select: { name: true, type: true, cpf: true, cnpj: true, phone: true },
        }),
      )
    : null;

  // Settings de garantia (paridade `warrantyNewMonths` e `warrantyUsedMonths`).
  const warrantySettings = await withTenant(tenantId, async (tx) =>
    tx.tenantSettings.findUnique({
      where: { tenantId },
      select: { warrantyNewMonths: true, warrantyUsedMonths: true },
    }),
  );
  const warrantyNew = warrantySettings?.warrantyNewMonths ?? 12;
  const warrantyUsed = warrantySettings?.warrantyUsedMonths ?? 3;

  // Stock items para descobrir condicao e garantia
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
            warrantyMonths: true,
          },
        }),
      )
    : [];
  const stockItemMap = new Map(stockItems.map((si) => [si.id, si]));

  const header = await loadTenantHeader(tenantId);

  const items = sale.items.map((it) => {
    const si = it.stockItemId ? stockItemMap.get(it.stockItemId) : null;
    // Garantia: usa warrantyMonths do stockItem; fallback baseado em condition
    let warrantyMonths = si?.warrantyMonths ?? null;
    if (warrantyMonths == null) {
      warrantyMonths = si?.condition && si.condition !== "NEW" ? warrantyUsed : warrantyNew;
    }
    return {
      description: it.description,
      imei: si?.imei ?? null,
      serial: si?.serialNumber ?? null,
      condition: si?.condition ?? "NEW",
      warrantyMonths,
    };
  });

  const maxWarrantyMonths = Math.max(...items.map((it) => it.warrantyMonths ?? 0), warrantyUsed);

  const data: SaleWarrantyPdfData = {
    sale: {
      number: sale.number,
      saleDate: sale.saleDate,
      items,
    },
    customer: customer
      ? {
          name: customer.name,
          documentLabel: formatCustomerDocument(customer)?.label ?? null,
          document: formatCustomerDocument(customer)?.value ?? null,
          phone: customer.phone,
        }
      : null,
    store: {
      name: header.storeName,
      cnpj: formatDoc(header.cnpj),
      phone: header.phone,
      address: header.address,
      logoDataUrl: header.logoDataUrl,
    },
    maxWarrantyMonths,
  };

  return renderPdfToBuffer(SaleWarrantyPdfDocument(data));
}
