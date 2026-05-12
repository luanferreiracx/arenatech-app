import { auth } from "@/server/auth";
import { withTenant, withAdmin } from "@/server/db";
import { cookies } from "next/headers";
import { z } from "zod";
import type { OrderPdfData } from "@/lib/service-order-pdfs";

const uuidSchema = z.string().uuid();

export async function getOrderPdfData(id: string): Promise<{ data: OrderPdfData; tenantId: string } | { error: string; status: number }> {
  const session = await auth();
  if (!session?.user) return { error: "Unauthorized", status: 401 };

  if (!uuidSchema.safeParse(id).success) return { error: "Invalid ID", status: 400 };

  const cookieStore = await cookies();
  const tenantId = cookieStore.get("x-active-tenant")?.value ?? session.activeTenantId;
  if (!tenantId || !uuidSchema.safeParse(tenantId).success) return { error: "No active tenant", status: 403 };

  const hasTenant = session.availableTenants.some((t) => t.id === tenantId);
  if (!hasTenant && !session.user.isSuperAdmin) return { error: "Forbidden", status: 403 };

  const order = await withTenant(tenantId, async (tx) => {
    return tx.serviceOrder.findFirst({
      where: { id, deletedAt: null },
      include: { items: { orderBy: { createdAt: "asc" } } },
    });
  });

  if (!order) return { error: "OS nao encontrada", status: 404 };

  const customer = await withTenant(tenantId, async (tx) => {
    return tx.customer.findFirst({
      where: { id: order.customerId },
      select: { name: true, cpf: true, phone: true },
    });
  });

  const tenantSettings = await withTenant(tenantId, async (tx) => {
    return tx.tenantSettings.findUnique({ where: { tenantId } });
  });

  const userIds = [order.technicianId].filter((uid): uid is string => !!uid);
  const users = userIds.length > 0
    ? await withAdmin(async (tx) => tx.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }))
    : [];
  const _userMap = new Map(users.map((u) => [u.id, u.name]));

  const data: OrderPdfData = {
    tenantName: tenantSettings?.tradeName ?? "Arena Tech",
    tenantCnpj: tenantSettings?.cnpj ?? null,
    tenantPhone: tenantSettings?.phone ?? null,
    number: order.number,
    status: order.status,
    customerName: customer?.name ?? "-",
    customerCpf: customer?.cpf ?? null,
    customerPhone: customer?.phone ?? null,
    deviceType: order.deviceType,
    deviceModel: order.deviceModel,
    imei: order.imei,
    items: order.items.map((item) => ({
      description: item.description,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
      total: Number(item.total),
    })),
    serviceAmount: Number(order.serviceAmount),
    partsAmount: Number(order.partsAmount),
    discount: Number(order.discount),
    totalAmount: Number(order.totalAmount),
    paidAmount: Number(order.paidAmount),
    paymentMethod: order.paymentMethod,
    paymentDiscount: Number(order.paymentDiscount),
    warrantyMonths: order.warrantyMonths,
    completedDate: order.completedDate,
    reportedProblem: order.reportedProblem,
  };

  return { data, tenantId };
}
