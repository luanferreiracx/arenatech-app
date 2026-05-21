import { ServiceOrderPdfDocument, type ServiceOrderPdfData } from "@/lib/pdf/service-order-pdf";
import { renderPdfToBuffer } from "@/lib/pdf/render";
import { withAdmin, withTenant } from "@/server/db";
import { formatCnpj, formatCpf } from "@/lib/utils";

/**
 * Carrega dados da OS + cliente + tenant + assistance e gera o PDF.
 *
 * Usado tanto pela rota HTTP `/api/service-orders/[id]/pdf` quanto
 * por procedures tRPC (ex: sendForSignature) que precisam do buffer
 * direto, sem passar por HTTP/cookies de auth.
 */
export async function buildServiceOrderPdf(
  tenantId: string,
  orderId: string,
): Promise<Buffer | null> {
  const order = await withTenant(tenantId, async (tx) =>
    tx.serviceOrder.findUnique({
      where: { id: orderId },
      include: { items: { orderBy: { createdAt: "asc" } } },
    }),
  );
  if (!order || order.deletedAt) return null;

  const customer = await withTenant(tenantId, async (tx) =>
    tx.customer.findUnique({
      where: { id: order.customerId },
      select: { name: true, cpf: true, phone: true, email: true },
    }),
  );

  const [tenant, settings, assistance] = await Promise.all([
    withAdmin(async (tx) =>
      tx.tenant.findUnique({ where: { id: tenantId }, select: { name: true, cnpj: true } }),
    ),
    withTenant(tenantId, async (tx) =>
      tx.tenantSettings.findUnique({
        where: { tenantId },
        select: { tradeName: true, cnpj: true, phone: true, logoUrl: true },
      }),
    ),
    withTenant(tenantId, async (tx) =>
      tx.tenantAssistanceSettings.findUnique({
        where: { tenantId },
        select: { termsOfService: true, warrantyPolicy: true },
      }),
    ),
  ]);

  let technicianName: string | null = null;
  if (order.technicianId) {
    const tech = await withAdmin(async (tx) =>
      tx.user.findUnique({ where: { id: order.technicianId! }, select: { name: true } }),
    );
    technicianName = tech?.name ?? null;
  }

  const data: ServiceOrderPdfData = {
    order: {
      number: order.number,
      entryDate: order.entryDate,
      deviceType: order.deviceType,
      deviceModel: order.deviceModel,
      imei: order.imei,
      devicePassword: order.devicePassword,
      reportedProblem: order.reportedProblem,
      entryChecklist: order.entryChecklist as Record<string, boolean | null> | null,
      deviceInfo: order.deviceInfo as Record<string, boolean> | null,
      serviceAmount: order.serviceAmount,
      partsAmount: order.partsAmount,
      discount: order.discount,
      totalAmount: order.totalAmount,
      paymentMethod: order.paymentMethod,
      completedDate: order.completedDate,
      technicianId: order.technicianId,
      items: order.items.map((it) => ({
        description: it.description,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        total: it.total,
      })),
    },
    customer: customer
      ? {
          name: customer.name,
          cpf: formatCpf(customer.cpf) || null,
          phone: customer.phone,
          email: customer.email,
        }
      : null,
    store: {
      name: settings?.tradeName ?? tenant?.name ?? "ARENA TECH",
      cnpj: formatCnpj(settings?.cnpj ?? tenant?.cnpj ?? ""),
      phone: settings?.phone ?? "",
      logoUrl: settings?.logoUrl ?? null,
    },
    technicianName,
    termsOfService: assistance?.termsOfService ?? null,
    warrantyPolicy: assistance?.warrantyPolicy ?? null,
  };

  return renderPdfToBuffer(ServiceOrderPdfDocument(data));
}
