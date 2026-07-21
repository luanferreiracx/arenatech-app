import {
  ReciboPdfDocument,
  TermoEntregaPdfDocument,
  TermoDevolucaoPdfDocument,
  type ReciboPdfData,
  type TermPdfData,
} from "@/lib/pdf/service-order-terms-pdf";
import { renderPdfToBuffer } from "@/lib/pdf/render";
import { withTenant } from "@/server/db";
import { formatCustomerDocument } from "@/lib/utils";
import { loadTenantHeader, formatDoc } from "@/lib/pdf/tenant-header";
import { valorPorExtenso } from "@/lib/valor-por-extenso";

/**
 * Adiciona N meses preservando o "ultimo dia do mes" (paridade Carbon::addMonths).
 * Evita o overflow do setMonth nativo: Jan 31 + 1m → Feb 31 → Mar 3 (errado).
 * Com o clamp, Jan 31 + 1m → Feb 28/29 (correto).
 */
function addMonthsClamped(d: Date, months: number): Date {
  const r = new Date(d);
  const day = r.getDate();
  r.setDate(1);
  r.setMonth(r.getMonth() + months);
  const lastDay = new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate();
  r.setDate(Math.min(day, lastDay));
  return r;
}

async function loadCommon(tenantId: string, orderId: string) {
  const order = await withTenant(tenantId, async (tx) =>
    tx.serviceOrder.findUnique({
      where: { id: orderId },
      include: {
        items: { orderBy: { createdAt: "asc" } },
        quotes: { where: { status: "approved" }, orderBy: { createdAt: "asc" } },
      },
    }),
  );
  if (!order || order.deletedAt) return null;

  const customer = await withTenant(tenantId, async (tx) =>
    tx.customer.findUnique({
      where: { id: order.customerId },
      select: { name: true, type: true, cpf: true, cnpj: true, phone: true },
    }),
  );

  const header = await loadTenantHeader(tenantId);

  const store = {
    name: header.storeName,
    cnpj: formatDoc(header.cnpj),
    phone: header.phone,
    logoDataUrl: header.logoDataUrl,
  };
  const os = {
    number: order.number,
    deviceType: order.deviceType,
    deviceModel: order.deviceModel,
    imei: order.imei,
  };
  const customerDoc = customer ? formatCustomerDocument(customer) : null;
  const customerInfo = {
    name: customer?.name ?? null,
    documentLabel: customerDoc?.label ?? null,
    document: customerDoc?.value ?? null,
    phone: customer?.phone ?? null,
  };

  return { order, store, os, customer: customerInfo };
}

/** Recibo de servico da OS (PDF binario). Paridade gerarHtmlRecibo. */
export async function buildServiceOrderReciboPdf(
  tenantId: string,
  orderId: string,
): Promise<Buffer | null> {
  const common = await loadCommon(tenantId, orderId);
  if (!common) return null;
  const { order, store, os, customer } = common;

  const valorTotal = Number(order.totalAmount ?? 0);
  const valorPago = Number(order.paidAmount ?? valorTotal);
  const prazoGarantia = order.warrantyMonths ?? 3;
  const dataConclusao = order.completedDate ?? new Date();
  const vencimentoGarantia = addMonthsClamped(dataConclusao, prazoGarantia);

  const data: ReciboPdfData = {
    store,
    os,
    customer,
    valorTotal,
    valorPago,
    descontoPagamento: Number(order.paymentDiscount ?? 0),
    formaPagamento: order.paymentMethod ?? null,
    extenso: valorPorExtenso(valorPago),
    prazoGarantiaMeses: prazoGarantia,
    vencimentoGarantia,
    items: order.items.map((it) => ({
      description: it.description,
      quantity: Math.round(Number(it.quantity)),
      unitPrice: Number(it.unitPrice),
      total: Number(it.total),
    })),
    quotes: order.quotes.map((q) => ({
      reason: q.reason,
      newTotal: Number(q.newTotal),
      additionalServices: q.additionalServices ?? null,
    })),
    partsAmount: Number(order.partsAmount ?? 0),
    discount: Number(order.discount ?? 0),
  };

  return renderPdfToBuffer(ReciboPdfDocument(data));
}

/** Termo de entrega da OS (PDF binario). Paridade gerarHtmlTermoEntrega. */
export async function buildServiceOrderTermoEntregaPdf(
  tenantId: string,
  orderId: string,
): Promise<Buffer | null> {
  const common = await loadCommon(tenantId, orderId);
  if (!common) return null;
  const data: TermPdfData = { store: common.store, os: common.os, customer: common.customer };
  return renderPdfToBuffer(TermoEntregaPdfDocument(data));
}

/** Termo de devolucao da OS (PDF binario). Paridade gerarHtmlTermoDevolucao. */
export async function buildServiceOrderTermoDevolucaoPdf(
  tenantId: string,
  orderId: string,
): Promise<Buffer | null> {
  const common = await loadCommon(tenantId, orderId);
  if (!common) return null;
  const data: TermPdfData = { store: common.store, os: common.os, customer: common.customer };
  return renderPdfToBuffer(TermoDevolucaoPdfDocument(data));
}
