import { PurchaseTermPdfDocument, type PurchaseTermPdfData } from "@/lib/pdf/purchase-term-pdf";
import { renderPdfToBuffer } from "@/lib/pdf/render";
import { withTenant } from "@/server/db";
import { formatCnpj, formatCpf } from "@/lib/utils";
import { loadTenantHeader, formatDoc } from "@/lib/pdf/tenant-header";

/**
 * Gera o PDF binario do termo de responsabilidade da compra de aparelho.
 * Paridade visual com Laravel intranetpdv `termo-responsabilidade-compra.blade.php`:
 * header com logo e divisor dourado, titulo destacado, info-table do vendedor,
 * declaracao vermelha (propriedade) + azul (autorizacao), resumo destacado em
 * dourado, assinatura unica do vendedor.
 */
export async function buildPurchaseTermPdf(
  tenantId: string,
  purchaseId: string,
): Promise<Buffer | null> {
  const purchase = await withTenant(tenantId, async (tx) =>
    tx.devicePurchase.findUnique({ where: { id: purchaseId } }),
  );
  if (!purchase) return null;

  let sellerName = "";
  let sellerDoc = "";
  let sellerPhone = "";
  let sellerAddress = "";

  if (purchase.sellerType === "customer" && purchase.customerId) {
    const customer = await withTenant(tenantId, async (tx) =>
      tx.customer.findUnique({
        where: { id: purchase.customerId! },
        select: {
          name: true, cpf: true, cnpj: true, phone: true,
          street: true, streetNumber: true, neighborhood: true, city: true, state: true,
        },
      }),
    );
    if (customer) {
      sellerName = customer.name;
      sellerDoc = customer.cpf
        ? `CPF: ${formatCpf(customer.cpf)}`
        : customer.cnpj
          ? `CNPJ: ${formatCnpj(customer.cnpj)}`
          : "";
      sellerPhone = customer.phone ?? "";
      sellerAddress = [
        customer.street, customer.streetNumber, customer.neighborhood,
        customer.city, customer.state,
      ].filter(Boolean).join(", ");
    }
  } else if (purchase.sellerType === "supplier" && purchase.supplierId) {
    const supplier = await withTenant(tenantId, async (tx) =>
      tx.supplier.findUnique({
        where: { id: purchase.supplierId! },
        select: {
          name: true, cnpj: true, cpf: true, phone: true,
          street: true, streetNumber: true, neighborhood: true, city: true, state: true,
        },
      }),
    );
    if (supplier) {
      sellerName = supplier.name;
      sellerDoc = supplier.cnpj
        ? `CNPJ: ${formatCnpj(supplier.cnpj)}`
        : supplier.cpf
          ? `CPF: ${formatCpf(supplier.cpf)}`
          : "";
      sellerPhone = supplier.phone ?? "";
      sellerAddress = [
        supplier.street, supplier.streetNumber, supplier.neighborhood,
        supplier.city, supplier.state,
      ].filter(Boolean).join(", ");
    }
  }

  const header = await loadTenantHeader(tenantId);

  const data: PurchaseTermPdfData = {
    purchase: {
      id: purchase.id,
      brand: purchase.brand,
      model: purchase.model,
      imei: purchase.imei,
      serial: purchase.serial,
      condition: purchase.condition,
      batteryHealth: purchase.batteryHealth,
      purchasePrice: purchase.purchasePrice,
      purchaseDate: purchase.purchaseDate,
      notes: purchase.notes,
      sellerType: purchase.sellerType,
    },
    seller: { name: sellerName, doc: sellerDoc, phone: sellerPhone, address: sellerAddress },
    store: {
      name: header.storeName,
      cnpj: formatDoc(header.cnpj),
      phone: header.phone,
      address: header.address,
      logoDataUrl: header.logoDataUrl,
    },
  };

  return renderPdfToBuffer(PurchaseTermPdfDocument(data));
}
