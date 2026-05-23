import { SaleReceiptPdfDocument, type SaleReceiptPdfData } from "@/lib/pdf/sale-receipt-pdf";
import { renderPdfToBuffer } from "@/lib/pdf/render";
import { withAdmin, withTenant } from "@/server/db";
import { formatCpf } from "@/lib/utils";
import { loadTenantHeader, formatDoc } from "@/lib/pdf/tenant-header";

/**
 * Gera o PDF binario do recibo de venda. Usado tanto pela rota HTTP publica
 * (whatsapp-media) quanto por procedures tRPC (sendReceipt) que precisam
 * do buffer direto. Visual fiel ao Laravel intranetpdv `recibo.blade.php`:
 * header com logo do tenant + nome em destaque, identidade dourada Arena Tech,
 * tabela de itens com header preto-noite, badges UPGRADE, box de upgrades
 * recebidos em troca, totais com TOTAL preto destacado, assinatura com fallback
 * Autentique quando aplicavel.
 */
export async function buildSaleReceiptPdf(
  tenantId: string,
  saleId: string,
): Promise<Buffer | null> {
  const sale = await withTenant(tenantId, async (tx) =>
    tx.sale.findUnique({
      where: { id: saleId },
      include: {
        items: { orderBy: { createdAt: "asc" } },
        upgrades: true,
      },
    }),
  );
  if (!sale || sale.deletedAt) return null;

  // Customer
  const customer = sale.customerId
    ? await withTenant(tenantId, async (tx) =>
        tx.customer.findUnique({
          where: { id: sale.customerId! },
          select: { name: true, cpf: true, phone: true },
        }),
      )
    : null;

  // Seller name
  let sellerName: string | null = null;
  try {
    const seller = await withAdmin(async (tx) =>
      tx.user.findUnique({ where: { id: sale.sellerId }, select: { name: true } }),
    );
    sellerName = seller?.name ?? null;
  } catch {
    sellerName = null;
  }

  // Header data + logo
  const header = await loadTenantHeader(tenantId);

  // Resolve item metadata (stock item: imei, serial, condition, battery) — opcional.
  const stockItemIds = sale.items
    .map((it) => it.stockItemId)
    .filter((v): v is string => !!v);
  const stockItems = stockItemIds.length
    ? await withTenant(tenantId, async (tx) =>
        tx.stockItem.findMany({
          where: { id: { in: stockItemIds } },
          select: {
            id: true,
            imei: true,
            serialNumber: true,
            condition: true,
            batteryHealth: true,
            warrantyMonths: true,
          },
        }),
      )
    : [];
  const stockItemMap = new Map(stockItems.map((si) => [si.id, si]));

  const data: SaleReceiptPdfData = {
    sale: {
      number: sale.number,
      saleDate: sale.saleDate,
      totalAmount: sale.totalAmount,
      subtotal: sale.subtotal,
      discountAmount: sale.discountAmount,
      discountType: sale.discountType,
      discountValue: sale.discountValue,
      paidAmount: sale.paidAmount,
      changeAmount: sale.changeAmount,
      paymentDetails: sale.paymentDetails,
      observations: sale.observations,
      refundDueAmount: sale.refundDueAmount,
      refundDueMethod: sale.refundDueMethod,
      signedViaAutentique: !!sale.signatureSignedAt && !sale.physicalSignature,
      items: sale.items.map((it) => {
        const si = it.stockItemId ? stockItemMap.get(it.stockItemId) : null;
        return {
          description: it.description,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          total: it.total,
          imei: si?.imei ?? null,
          serial: si?.serialNumber ?? null,
          condition: si?.condition ?? null,
          batteryHealth: si?.batteryHealth ?? null,
          warrantyMonths: si?.warrantyMonths ?? null,
          isUpgrade: false, // SaleItem nao tem flag de upgrade — upgrades sao tabela separada
        };
      }),
      upgrades: sale.upgrades.map((upg) => ({
        description: [upg.brand, upg.model].filter(Boolean).join(" ") || "Aparelho",
        imei: upg.imei,
        serial: upg.serialNumber,
        condition: upg.condition,
        batteryHealth: upg.batteryHealth,
        abatedValue: upg.abatedValue,
      })),
    },
    customer: customer
      ? { name: customer.name, cpf: formatCpf(customer.cpf) || null, phone: customer.phone }
      : null,
    sellerName,
    store: {
      name: header.storeName,
      cnpj: formatDoc(header.cnpj),
      phone: header.phone,
      address: header.address,
      logoDataUrl: header.logoDataUrl,
    },
  };

  return renderPdfToBuffer(SaleReceiptPdfDocument(data));
}
