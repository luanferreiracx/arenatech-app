import { SaleReceiptPdfDocument, type SaleReceiptPdfData } from "@/lib/pdf/sale-receipt-pdf";
import { renderPdfToBuffer } from "@/lib/pdf/render";
import { withAdmin, withTenant } from "@/server/db";
import { formatCpf } from "@/lib/utils";
import { loadTenantHeader, formatDoc } from "@/lib/pdf/tenant-header";
import { PAYMENT_METHOD_LABELS } from "@/lib/validators/sale";

const PAYMENT_METHOD_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

  // Settings de garantia (fallback quando StockItem.warrantyMonths e null).
  // Paridade Laravel: garantia por condicao (novo vs usado) vinda das settings.
  const warrantySettings = await withTenant(tenantId, async (tx) =>
    tx.tenantSettings.findUnique({
      where: { tenantId },
      select: { warrantyNewMonths: true, warrantyUsedMonths: true },
    }),
  );
  const warrantyNew = warrantySettings?.warrantyNewMonths ?? 12;
  const warrantyUsed = warrantySettings?.warrantyUsedMonths ?? 3;

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
            product: { select: { isDevice: true } },
          },
        }),
      )
    : [];
  const stockItemMap = new Map(stockItems.map((si) => [si.id, si]));

  // Resolve o nome legível das formas de pagamento gravadas em paymentDetails:
  // o `method` pode ser o UUID de um PaymentMethod cadastrado — sem isto o
  // recibo imprimia o UUID cru. Ordem: mapa nativo → nome do PaymentMethod.
  const rawPayments = Array.isArray(sale.paymentDetails)
    ? (sale.paymentDetails as Array<Record<string, unknown>>)
    : [];
  const uuidMethodIds = [
    ...new Set(
      rawPayments
        .map((p) => (typeof p.method === "string" ? p.method : null))
        .filter((m): m is string => !!m && PAYMENT_METHOD_UUID_RE.test(m)),
    ),
  ];
  const methodNameById = new Map<string, string>();
  if (uuidMethodIds.length > 0) {
    const methods = await withTenant(tenantId, async (tx) =>
      tx.paymentMethod.findMany({
        where: { id: { in: uuidMethodIds }, tenantId },
        select: { id: true, name: true },
      }),
    );
    for (const m of methods) methodNameById.set(m.id, m.name);
  }
  const paymentDetailsResolved = rawPayments.map((p) => {
    const method = typeof p.method === "string" ? p.method : "";
    return {
      ...p,
      methodLabel:
        PAYMENT_METHOD_LABELS[method] ?? methodNameById.get(method) ?? method,
    };
  });

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
      // Acrescimo do cartao/parcelamento: diferenca entre o que o cliente
      // pagou na maquininha e o valor da venda. Exibido como "Acrescimo" e
      // "Total pago pelo cliente" no recibo quando > 0.
      surchargeAmount: sale.surchargeAmount,
      changeAmount: sale.changeAmount,
      paymentDetails: paymentDetailsResolved,
      observations: sale.observations,
      refundDueAmount: sale.refundDueAmount,
      refundDueMethod: sale.refundDueMethod,
      signedViaAutentique: !!sale.signatureSignedAt && !sale.physicalSignature,
      items: sale.items.map((it) => {
        const si = it.stockItemId ? stockItemMap.get(it.stockItemId) : null;
        // Prioriza o snapshot persistido no SaleItem (paridade Laravel
        // pdv_venda_itens). Fallback pro StockItem quando o item nao tem
        // snapshot (vendas antigas antes do snapshot). Por ultimo, garantia
        // padrao das settings por condicao pra aparelhos.
        const itAny = it as typeof it & {
          imei?: string | null; serial?: string | null; condition?: string | null;
          batteryHealth?: number | null; warrantyMonths?: number | null; ehUpgrade?: boolean;
        };
        const imei = itAny.imei ?? si?.imei ?? null;
        const serial = itAny.serial ?? si?.serialNumber ?? null;
        const condition = itAny.condition ?? si?.condition ?? null;
        const batteryHealth = itAny.batteryHealth ?? si?.batteryHealth ?? null;
        let warrantyMonths = itAny.warrantyMonths ?? si?.warrantyMonths ?? null;
        if (warrantyMonths == null && (si?.product?.isDevice || imei || serial)) {
          warrantyMonths = condition && condition !== "NEW" ? warrantyUsed : warrantyNew;
        }
        return {
          description: it.description,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          total: it.total,
          imei,
          serial,
          condition,
          batteryHealth,
          warrantyMonths,
          isUpgrade: itAny.ehUpgrade ?? false,
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
