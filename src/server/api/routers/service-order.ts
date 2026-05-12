import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, tenantProcedure, publicProcedure } from "@/server/api/trpc";
import { withAdmin } from "@/server/db";
import {
  createServiceOrderSchema,
  updateServiceOrderSchema,
  updateStatusSchema,
  listServiceOrdersSchema,
  addItemSchema,
  updateItemSchema,
  registerPaymentSchema,
  addDocumentSchema,
  updateCostsSchema,
  ALLOWED_TRANSITIONS,
  type ServiceOrderStatusValue,
} from "@/lib/validators/service-order";
import * as autentiqueService from "@/lib/services/autentique-service";
import * as depixService from "@/lib/services/depix-service";
import * as whatsappService from "@/lib/services/whatsapp-service";
import { logger } from "@/lib/logger";
import crypto from "crypto";

// ── Helpers ──────────────────────────────────────────────────────────────────

function generatePublicLink(): string {
  return crypto.randomBytes(16).toString("hex");
}

type TransactionClient = Parameters<Parameters<typeof import("@/server/db").withAdmin>[0]>[0];

async function generateOrderNumber(tx: TransactionClient, tenantId: string): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `OS${year}`;

  // Retry loop handles concurrent number generation
  for (let attempt = 0; attempt < 3; attempt++) {
    const lastOrder = await tx.serviceOrder.findFirst({
      where: { tenantId, number: { startsWith: prefix } },
      orderBy: { number: "desc" },
      select: { number: true },
    });

    const lastNum = lastOrder ? parseInt(lastOrder.number.slice(prefix.length), 10) : 0;
    const newNumber = `${prefix}${String(lastNum + 1).padStart(5, "0")}`;

    // Check if already exists (concurrent conflict)
    const exists = await tx.serviceOrder.findFirst({ where: { tenantId, number: newNumber } });
    if (!exists) return newNumber;
  }

  // Fallback: use timestamp-based suffix
  return `${prefix}${Date.now().toString().slice(-5)}`;
}

async function recalculateTotals(tx: TransactionClient, orderId: string, discount?: number) {
  const items = await tx.serviceOrderItem.findMany({
    where: { orderId },
  });

  let serviceAmount = 0;
  let partsAmount = 0;
  let partsCost = 0;

  for (const item of items) {
    const total = Number(item.total);
    const cost = Number(item.costPrice) * Number(item.quantity);
    if (item.type === "SERVICE") {
      serviceAmount += total;
    } else {
      partsAmount += total;
      partsCost += cost;
    }
  }

  const currentOrder = await tx.serviceOrder.findFirst({
    where: { id: orderId },
    select: { discount: true },
  });

  const appliedDiscount = discount ?? Number(currentOrder?.discount ?? 0);
  const totalAmount = Math.max(0, serviceAmount + partsAmount - appliedDiscount);

  await tx.serviceOrder.update({
    where: { id: orderId },
    data: {
      serviceAmount,
      partsAmount,
      partsCost,
      ...(discount !== undefined ? { discount } : {}),
      totalAmount,
    },
  });

  return { serviceAmount, partsAmount, partsCost, totalAmount };
}

// ── Router ───────────────────────────────────────────────────────────────────

export const serviceOrderRouter = createTRPCRouter({
  // ── List ────────────────────────────────────────────────────────────────────

  list: tenantProcedure
    .input(listServiceOrdersSchema)
    .query(async ({ ctx, input }) => {
      const { search, status, technicianId, customerId, dateFrom, dateTo, page, pageSize } = input;
      const skip = page * pageSize;

      return ctx.withTenant(async (tx) => {
        // If searching, also search by customer name/CPF
        let searchCustomerIds: string[] | undefined;
        if (search) {
          const matchingCustomers = await tx.customer.findMany({
            where: {
              deletedAt: null,
              OR: [
                { name: { contains: search, mode: "insensitive" as const } },
                { cpf: { contains: search, mode: "insensitive" as const } },
              ],
            },
            select: { id: true },
            take: 50,
          });
          searchCustomerIds = matchingCustomers.map((c) => c.id);
        }

        const where = {
          deletedAt: null,
          ...(status ? { status } : {}),
          ...(technicianId ? { technicianId } : {}),
          ...(customerId ? { customerId } : {}),
          ...(dateFrom || dateTo
            ? {
                entryDate: {
                  ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
                  ...(dateTo ? { lte: new Date(dateTo) } : {}),
                },
              }
            : {}),
          ...(search
            ? {
                OR: [
                  { number: { contains: search, mode: "insensitive" as const } },
                  { imei: { contains: search, mode: "insensitive" as const } },
                  { serialNumber: { contains: search, mode: "insensitive" as const } },
                  { deviceModel: { contains: search, mode: "insensitive" as const } },
                  ...(searchCustomerIds && searchCustomerIds.length > 0
                    ? [{ customerId: { in: searchCustomerIds } }]
                    : []),
                ],
              }
            : {}),
        };

        const [items, total] = await Promise.all([
          tx.serviceOrder.findMany({
            where,
            skip,
            take: pageSize,
            orderBy: { entryDate: "desc" },
            include: {
              items: true,
            },
          }),
          tx.serviceOrder.count({ where }),
        ]);

        // Fetch customer names via admin (customers table is also RLS-scoped, use same tenant)
        const customerIds = [...new Set(items.map((o) => o.customerId))];
        const customers = customerIds.length > 0
          ? await tx.customer.findMany({
              where: { id: { in: customerIds } },
              select: { id: true, name: true, cpf: true, phone: true },
            })
          : [];
        const customerMap = new Map(customers.map((c) => [c.id, c]));

        // Fetch technician names (users table is global — use withAdmin)
        const techIds = [...new Set(items.filter((o) => o.technicianId).map((o) => o.technicianId!))];
        let technicianMap = new Map<string, { id: string; name: string }>();
        if (techIds.length > 0) {
          const technicians = await withAdmin(async (adminTx) => {
            return adminTx.user.findMany({
              where: { id: { in: techIds } },
              select: { id: true, name: true },
            });
          });
          technicianMap = new Map(technicians.map((t) => [t.id, t]));
        }

        const enrichedItems = items.map((order) => ({
          ...order,
          customer: customerMap.get(order.customerId) ?? null,
          technician: order.technicianId ? technicianMap.get(order.technicianId) ?? null : null,
        }));

        return { items: enrichedItems, total, pageCount: Math.ceil(total / pageSize) };
      });
    }),

  // ── Get By Id ──────────────────────────────────────────────────────────────

  getById: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const order = await tx.serviceOrder.findFirst({
          where: { id: input.id, deletedAt: null },
          include: {
            items: { orderBy: { createdAt: "asc" } },
            history: { orderBy: { createdAt: "desc" } },
            documents: { orderBy: { createdAt: "desc" } },
          },
        });

        if (!order) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Ordem de Serviço não encontrada" });
        }

        // Fetch customer
        const customer = await tx.customer.findFirst({
          where: { id: order.customerId },
          select: { id: true, name: true, cpf: true, cnpj: true, phone: true, email: true, type: true },
        });

        // Fetch technician, vendor, and history users via admin
        const userIds = [
          order.createdById,
          order.technicianId,
          order.vendorId,
          ...order.history.map((h) => h.userId),
        ].filter((id): id is string => !!id);

        const uniqueUserIds = [...new Set(userIds)];
        let userMap = new Map<string, { id: string; name: string }>();
        if (uniqueUserIds.length > 0) {
          const users = await withAdmin(async (adminTx) => {
            return adminTx.user.findMany({
              where: { id: { in: uniqueUserIds } },
              select: { id: true, name: true },
            });
          });
          userMap = new Map(users.map((u) => [u.id, u]));
        }

        const enrichedHistory = order.history.map((h) => ({
          ...h,
          user: userMap.get(h.userId) ?? null,
        }));

        return {
          ...order,
          customer,
          technician: order.technicianId ? userMap.get(order.technicianId) ?? null : null,
          vendor: order.vendorId ? userMap.get(order.vendorId) ?? null : null,
          createdBy: userMap.get(order.createdById) ?? null,
          history: enrichedHistory,
        };
      });
    }),

  // ── Create ─────────────────────────────────────────────────────────────────

  create: tenantProcedure
    .input(createServiceOrderSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      return ctx.withTenant(async (tx) => {
        const number = await generateOrderNumber(tx, ctx.tenantId);
        const publicLink = generatePublicLink();

        // Calculate item totals
        const itemsData = input.items.map((item) => ({
          tenantId: ctx.tenantId,
          type: item.type,
          serviceId: item.serviceId ?? null,
          productId: item.productId ?? null,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          costPrice: item.costPrice ?? 0,
          total: item.quantity * item.unitPrice,
        }));

        let serviceAmount = 0;
        let partsAmount = 0;
        let partsCost = 0;
        for (const item of itemsData) {
          if (item.type === "SERVICE") {
            serviceAmount += item.total;
          } else {
            partsAmount += item.total;
            partsCost += item.costPrice * item.quantity;
          }
        }

        const discount = input.discount ?? 0;
        const totalAmount = Math.max(0, serviceAmount + partsAmount - discount);

        const order = await tx.serviceOrder.create({
          data: {
            tenantId: ctx.tenantId,
            number,
            customerId: input.customerId,
            technicianId: input.technicianId ?? null,
            vendorId: input.vendorId ?? null,
            createdById: userId,
            status: "OPEN",
            publicLink,
            deviceType: input.deviceType ?? null,
            deviceBrand: input.deviceBrand ?? null,
            deviceModel: input.deviceModel ?? null,
            serialNumber: input.serialNumber ?? null,
            imei: input.imei ?? null,
            devicePassword: input.devicePassword ?? null,
            reportedProblem: input.reportedProblem,
            entryChecklist: input.entryChecklist ?? undefined,
            deviceInfo: input.deviceInfo ?? undefined,
            serviceAmount,
            partsAmount,
            partsCost,
            discount,
            totalAmount,
            isWarranty: input.isWarranty ?? false,
            warrantyType: input.warrantyType ?? null,
            warrantyMonths: input.warrantyMonths ?? 3,
            originalOrderId: input.originalOrderId ?? null,
            estimatedDate: input.estimatedDate ? new Date(input.estimatedDate) : null,
            internalNotes: input.internalNotes ?? null,
            customerNotes: input.customerNotes ?? null,
          },
        });

        // Create items
        if (itemsData.length > 0) {
          await tx.serviceOrderItem.createMany({
            data: itemsData.map((item) => ({
              ...item,
              orderId: order.id,
            })),
          });
        }

        // Create initial history entry
        await tx.serviceOrderHistory.create({
          data: {
            tenantId: ctx.tenantId,
            orderId: order.id,
            userId,
            previousStatus: null,
            newStatus: "OPEN",
            notes: "Ordem de Serviço criada",
          },
        });

        return tx.serviceOrder.findFirst({
          where: { id: order.id },
          include: { items: true, history: true },
        });
      });
    }),

  // ── Update (data only — not status) ─────────────────────────────────────────

  update: tenantProcedure
    .input(updateServiceOrderSchema.extend({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { id, discount, ...data } = input;

      return ctx.withTenant(async (tx) => {
        const order = await tx.serviceOrder.findFirst({
          where: { id, deletedAt: null },
        });

        if (!order) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Ordem de Serviço não encontrada" });
        }

        // Do not allow editing delivered/cancelled/refunded orders
        if (["DELIVERED", "CANCELLED", "REFUNDED"].includes(order.status)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Não é possível editar uma OS neste status",
          });
        }

        const updateData: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(data)) {
          if (value !== undefined) {
            if (key === "estimatedDate" && value) {
              updateData[key] = new Date(value as string);
            } else {
              updateData[key] = value;
            }
          }
        }

        await tx.serviceOrder.update({
          where: { id },
          data: updateData,
        });

        if (discount !== undefined) {
          await recalculateTotals(tx, id, discount);
        }

        return tx.serviceOrder.findFirst({
          where: { id },
          include: { items: true },
        });
      });
    }),

  // ── Delete (soft) ──────────────────────────────────────────────────────────

  delete: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        return tx.serviceOrder.update({
          where: { id: input.id },
          data: { deletedAt: new Date() },
        });
      });
    }),

  // ── Update Status ──────────────────────────────────────────────────────────

  updateStatus: tenantProcedure
    .input(updateStatusSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      return ctx.withTenant(async (tx) => {
        const order = await tx.serviceOrder.findFirst({
          where: { id: input.orderId, deletedAt: null },
        });

        if (!order) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Ordem de Serviço não encontrada" });
        }

        // Validate transition
        const currentStatus = order.status as ServiceOrderStatusValue;
        const allowedNext = ALLOWED_TRANSITIONS[currentStatus];
        if (!allowedNext.includes(input.status)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Transição de ${currentStatus} para ${input.status} não é permitida`,
          });
        }

        // Validate required fields for specific transitions
        if (input.status === "CANCELLED" && !input.cancellationReason) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Motivo de cancelamento é obrigatório",
          });
        }
        if (input.status === "REFUNDED" && !input.refundReason) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Motivo de estorno é obrigatório",
          });
        }

        // Automatic date updates
        const dateUpdates: Record<string, unknown> = {};
        if (input.status === "COMPLETED") {
          dateUpdates.completedDate = new Date();
        }
        if (input.status === "DELIVERED") {
          dateUpdates.deliveredDate = new Date();
        }
        if (input.status === "REFUNDED") {
          dateUpdates.refundedAt = new Date();
          dateUpdates.refundedById = userId;
          dateUpdates.refundReason = input.refundReason;
        }
        if (input.status === "CANCELLED") {
          dateUpdates.cancellationReason = input.cancellationReason;
        }

        // Update order status
        await tx.serviceOrder.update({
          where: { id: input.orderId },
          data: {
            status: input.status,
            ...dateUpdates,
          },
        });

        // Create history entry
        await tx.serviceOrderHistory.create({
          data: {
            tenantId: ctx.tenantId,
            orderId: input.orderId,
            userId,
            previousStatus: currentStatus,
            newStatus: input.status,
            notes: input.notes ?? null,
          },
        });

        return tx.serviceOrder.findFirst({
          where: { id: input.orderId },
          include: { items: true, history: { orderBy: { createdAt: "desc" } } },
        });
      });
    }),

  // ── Add Item ───────────────────────────────────────────────────────────────

  addItem: tenantProcedure
    .input(addItemSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const order = await tx.serviceOrder.findFirst({
          where: { id: input.orderId, deletedAt: null },
        });

        if (!order) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Ordem de Serviço não encontrada" });
        }

        if (["DELIVERED", "CANCELLED", "REFUNDED"].includes(order.status)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Não é possível adicionar itens neste status",
          });
        }

        const total = input.quantity * input.unitPrice;

        await tx.serviceOrderItem.create({
          data: {
            tenantId: ctx.tenantId,
            orderId: input.orderId,
            type: input.type,
            serviceId: input.serviceId ?? null,
            productId: input.productId ?? null,
            description: input.description,
            quantity: input.quantity,
            unitPrice: input.unitPrice,
            costPrice: input.costPrice ?? 0,
            total,
          },
        });

        await recalculateTotals(tx, input.orderId);

        return tx.serviceOrder.findFirst({
          where: { id: input.orderId },
          include: { items: true },
        });
      });
    }),

  // ── Update Item ────────────────────────────────────────────────────────────

  updateItem: tenantProcedure
    .input(updateItemSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const item = await tx.serviceOrderItem.findFirst({
          where: { id: input.itemId },
          include: { order: { select: { id: true, status: true } } },
        });

        if (!item) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Item não encontrado" });
        }

        if (["DELIVERED", "CANCELLED", "REFUNDED"].includes(item.order.status)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Não é possível editar itens neste status",
          });
        }

        const newQuantity = input.quantity ?? Number(item.quantity);
        const newUnitPrice = input.unitPrice ?? Number(item.unitPrice);
        const newTotal = newQuantity * newUnitPrice;

        await tx.serviceOrderItem.update({
          where: { id: input.itemId },
          data: {
            ...(input.description !== undefined ? { description: input.description } : {}),
            ...(input.quantity !== undefined ? { quantity: input.quantity } : {}),
            ...(input.unitPrice !== undefined ? { unitPrice: input.unitPrice } : {}),
            ...(input.costPrice !== undefined ? { costPrice: input.costPrice } : {}),
            total: newTotal,
          },
        });

        await recalculateTotals(tx, item.orderId);

        return tx.serviceOrder.findFirst({
          where: { id: item.orderId },
          include: { items: true },
        });
      });
    }),

  // ── Remove Item ────────────────────────────────────────────────────────────

  removeItem: tenantProcedure
    .input(z.object({ itemId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const item = await tx.serviceOrderItem.findFirst({
          where: { id: input.itemId },
          include: { order: { select: { id: true, status: true } } },
        });

        if (!item) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Item não encontrado" });
        }

        if (["DELIVERED", "CANCELLED", "REFUNDED"].includes(item.order.status)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Não é possível remover itens neste status",
          });
        }

        await tx.serviceOrderItem.delete({ where: { id: input.itemId } });
        await recalculateTotals(tx, item.orderId);

        return tx.serviceOrder.findFirst({
          where: { id: item.orderId },
          include: { items: true },
        });
      });
    }),

  // ── Register Payment ───────────────────────────────────────────────────────

  registerPayment: tenantProcedure
    .input(registerPaymentSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      return ctx.withTenant(async (tx) => {
        const order = await tx.serviceOrder.findFirst({
          where: { id: input.orderId, deletedAt: null },
        });

        if (!order) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Ordem de Serviço não encontrada" });
        }

        if (order.status !== "COMPLETED") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Pagamento só pode ser registrado quando a OS está Concluída",
          });
        }

        const paymentDiscount = input.paymentDiscount ?? 0;
        const paidAmount = input.paidAmount;

        // Update order with payment info
        await tx.serviceOrder.update({
          where: { id: input.orderId },
          data: {
            status: "PAID",
            paymentMethod: input.paymentMethod,
            paymentNotes: input.paymentNotes ?? null,
            paymentDiscount,
            paidAmount,
            paymentDate: new Date(),
          },
        });

        // Create history entry
        await tx.serviceOrderHistory.create({
          data: {
            tenantId: ctx.tenantId,
            orderId: input.orderId,
            userId,
            previousStatus: "COMPLETED",
            newStatus: "PAID",
            notes: `Pagamento registrado: ${input.paymentMethod}`,
          },
        });

        // Create financial transaction (RECEIVABLE)
        await tx.financialTransaction.create({
          data: {
            tenantId: ctx.tenantId,
            type: "RECEIVABLE",
            status: "PAID",
            description: `OS ${order.number} — Pagamento`,
            totalAmount: paidAmount,
            paidAmount,
            dueDate: new Date(),
            paidAt: new Date(),
            referenceId: order.id,
            referenceType: "SERVICE_ORDER",
            customerId: order.customerId,
          },
        });

        // Create cash movement if user has open cash register
        const openRegister = await tx.cashRegister.findFirst({
          where: { userId, status: "OPEN" },
        });

        if (openRegister) {
          await tx.cashMovement.create({
            data: {
              tenantId: ctx.tenantId,
              cashRegisterId: openRegister.id,
              type: "SERVICE_ORDER",
              amount: paidAmount,
              paymentMethod: input.paymentMethod,
              description: `OS ${order.number}`,
              referenceId: order.id,
              referenceType: "SERVICE_ORDER",
              userId,
            },
          });
        }

        return tx.serviceOrder.findFirst({
          where: { id: input.orderId },
          include: { items: true, history: { orderBy: { createdAt: "desc" } } },
        });
      });
    }),

  // ── Documents ──────────────────────────────────────────────────────────────

  addDocument: tenantProcedure
    .input(addDocumentSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        return tx.serviceOrderDocument.create({
          data: {
            tenantId: ctx.tenantId,
            orderId: input.orderId,
            type: input.type,
            name: input.name,
            url: input.url,
            mimeType: input.mimeType ?? null,
            size: input.size ?? null,
          },
        });
      });
    }),

  listDocuments: tenantProcedure
    .input(z.object({ orderId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        return tx.serviceOrderDocument.findMany({
          where: { orderId: input.orderId },
          orderBy: { createdAt: "desc" },
        });
      });
    }),

  // ── Stats ──────────────────────────────────────────────────────────────────

  stats: tenantProcedure.query(async ({ ctx }) => {
    return ctx.withTenant(async (tx) => {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      const [
        totalOpen,
        totalInProgress,
        completedThisMonth,
        revenueThisMonth,
      ] = await Promise.all([
        tx.serviceOrder.count({
          where: {
            deletedAt: null,
            status: { in: ["OPEN", "IN_DIAGNOSIS", "WAITING_APPROVAL", "APPROVED", "WAITING_PARTS"] },
          },
        }),
        tx.serviceOrder.count({
          where: {
            deletedAt: null,
            status: "IN_PROGRESS",
          },
        }),
        tx.serviceOrder.count({
          where: {
            deletedAt: null,
            status: { in: ["COMPLETED", "PAID", "READY_FOR_PICKUP", "DELIVERED"] },
            completedDate: { gte: startOfMonth },
          },
        }),
        tx.serviceOrder.findMany({
          where: {
            deletedAt: null,
            status: { in: ["PAID", "READY_FOR_PICKUP", "DELIVERED"] },
            createdAt: { gte: startOfMonth },
          },
          select: { paidAmount: true },
        }),
      ]);

      const revenue = revenueThisMonth.reduce(
        (sum, o) => sum + Number(o.paidAmount),
        0,
      );

      return {
        totalOpen,
        totalInProgress,
        completedThisMonth,
        revenueThisMonth: revenue,
      };
    });
  }),

  // ── By Public Link (no auth) ───────────────────────────────────────────────

  byPublicLink: publicProcedure
    .input(z.object({ publicLink: z.string().min(1) }))
    .query(async ({ input }) => {
      // Public endpoint — use admin to bypass RLS (link is the auth)
      return withAdmin(async (tx) => {
        const order = await tx.serviceOrder.findFirst({
          where: { publicLink: input.publicLink, deletedAt: null },
          select: {
            id: true,
            number: true,
            status: true,
            deviceType: true,
            deviceBrand: true,
            deviceModel: true,
            entryDate: true,
            estimatedDate: true,
            completedDate: true,
            deliveredDate: true,
            customerNotes: true,
          },
        });

        if (!order) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Ordem de Serviço não encontrada" });
        }

        return order;
      });
    }),

  // ── Technicians list (for selectors) ───────────────────────────────────────

  // ── Update Costs (inline on detail sidebar) ─────────────────────────────
  updateCosts: tenantProcedure
    .input(updateCostsSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const order = await tx.serviceOrder.findFirst({
          where: { id: input.orderId, deletedAt: null },
        });

        if (!order) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Ordem de Serviço não encontrada" });
        }

        await tx.serviceOrder.update({
          where: { id: input.orderId },
          data: {
            partsCost: input.partsCost,
            otherCost: input.otherCost,
          },
        });

        return tx.serviceOrder.findFirst({
          where: { id: input.orderId },
          include: { items: true },
        });
      });
    }),

  // ── List Vendors (for selectors) ──────────────────────────────────────
  listVendors: tenantProcedure
    .input(z.object({ search: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const userTenants = await tx.userTenant.findMany({
          where: {
            tenantId: ctx.tenantId,
            role: { in: ["seller", "operator", "admin"] },
          },
          select: { userId: true },
        });

        const userIds = userTenants.map((ut) => ut.userId);
        if (userIds.length === 0) return [];

        const users = await withAdmin(async (adminTx) => {
          return adminTx.user.findMany({
            where: {
              id: { in: userIds },
              ...(input?.search
                ? { name: { contains: input.search, mode: "insensitive" as const } }
                : {}),
            },
            select: { id: true, name: true },
            orderBy: { name: "asc" },
          });
        });

        return users;
      });
    }),

  listTechnicians: tenantProcedure
    .input(z.object({ search: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      // Users are global, but we need tenant-scoped roles
      return ctx.withTenant(async (tx) => {
        const userTenants = await tx.userTenant.findMany({
          where: {
            tenantId: ctx.tenantId,
            role: { in: ["technician", "operator", "admin"] },
          },
          select: { userId: true },
        });

        const userIds = userTenants.map((ut) => ut.userId);
        if (userIds.length === 0) return [];

        const users = await withAdmin(async (adminTx) => {
          return adminTx.user.findMany({
            where: {
              id: { in: userIds },
              ...(input?.search
                ? { name: { contains: input.search, mode: "insensitive" as const } }
                : {}),
            },
            select: { id: true, name: true },
            orderBy: { name: "asc" },
          });
        });

        return users;
      });
    }),

  // ── Cancelar ──────────────────────────────────────────────────────────────
  cancelar: tenantProcedure
    .input(z.object({
      orderId: z.string().uuid(),
      motivo: z.string().min(1, "Motivo obrigatorio"),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      return ctx.withTenant(async (tx) => {
        const order = await tx.serviceOrder.findFirst({ where: { id: input.orderId, deletedAt: null } });
        if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "OS nao encontrada" });
        if (["COMPLETED", "DELIVERED"].includes(order.status)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Nao e possivel cancelar OS concluida ou entregue" });
        }
        await tx.serviceOrder.update({
          where: { id: input.orderId },
          data: { status: "CANCELLED", cancellationReason: input.motivo },
        });
        await tx.serviceOrderHistory.create({
          data: { tenantId: ctx.tenantId, orderId: input.orderId, userId, previousStatus: order.status, newStatus: "CANCELLED", notes: `Cancelamento: ${input.motivo}` },
        });
        return { success: true };
      });
    }),

  // ── Descancelar (admin only) ──────────────────────────────────────────────
  descancelar: tenantProcedure
    .input(z.object({
      orderId: z.string().uuid(),
      motivo: z.string().min(1, "Motivo obrigatorio"),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      return ctx.withTenant(async (tx) => {
        const order = await tx.serviceOrder.findFirst({ where: { id: input.orderId, deletedAt: null } });
        if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "OS nao encontrada" });
        if (order.status !== "CANCELLED") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Apenas OS canceladas podem ser descanceladas" });
        }
        await tx.serviceOrder.update({
          where: { id: input.orderId },
          data: { status: "IN_DIAGNOSIS", cancellationReason: null },
        });
        await tx.serviceOrderHistory.create({
          data: { tenantId: ctx.tenantId, orderId: input.orderId, userId, previousStatus: "CANCELLED", newStatus: "IN_DIAGNOSIS", notes: `[DESCANCELAMENTO] ${input.motivo}` },
        });
        return { success: true };
      });
    }),

  // ── Estornar ──────────────────────────────────────────────────────────────
  estornar: tenantProcedure
    .input(z.object({
      orderId: z.string().uuid(),
      motivo: z.string().min(10, "Motivo deve ter no minimo 10 caracteres"),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      return ctx.withTenant(async (tx) => {
        const order = await tx.serviceOrder.findFirst({ where: { id: input.orderId, deletedAt: null } });
        if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "OS nao encontrada" });
        if (order.status !== "DELIVERED") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Apenas OS entregues podem ser estornadas" });
        }
        await tx.serviceOrder.update({
          where: { id: input.orderId },
          data: { status: "REFUNDED", refundReason: input.motivo, refundedAt: new Date(), refundedById: userId },
        });
        await tx.serviceOrderHistory.create({
          data: { tenantId: ctx.tenantId, orderId: input.orderId, userId, previousStatus: "DELIVERED", newStatus: "REFUNDED", notes: `[ESTORNO] ${input.motivo}` },
        });
        return { success: true };
      });
    }),

  // ── Assinatura Digital (Autentique) ───────────────────────────────────────
  enviarAssinatura: tenantProcedure
    .input(z.object({ orderId: z.string().uuid(), whatsapp: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      return ctx.withTenant(async (tx) => {
        const order = await tx.serviceOrder.findFirst({
          where: { id: input.orderId, deletedAt: null },
        });
        if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "OS nao encontrada" });

        const customer = await tx.customer.findFirst({
          where: { id: order.customerId },
          select: { name: true, phone: true },
        });
        const phone = input.whatsapp ?? customer?.phone;
        if (!phone) throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum telefone disponivel" });

        // Create a placeholder PDF buffer (the real one would be generated server-side)
        const pdfBuffer = Buffer.from("PDF placeholder for digital signature");

        const result = await autentiqueService.createDocumentWithLink(
          `Ordem de Servico #${order.number}`,
          [{ name: customer?.name ?? "Cliente", whatsapp: phone }],
          pdfBuffer,
        );

        if (!result.success) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.error ?? "Erro ao criar documento" });
        }

        await tx.serviceOrder.update({
          where: { id: input.orderId },
          data: {
            signatureDocumentId: result.documentId,
            signatureUrl: result.signatureLink,
            signatureSentAt: new Date(),
          },
        });

        // Send via WhatsApp
        if (result.signatureLink) {
          const msg = `Assinatura - OS #${order.number}\n\nOla, ${customer?.name ?? "Cliente"}! Para assinar digitalmente:\n${result.signatureLink}\n\nApos assinar, seu aparelho estara liberado para o servico.`;
          await whatsappService.sendTextMessage(phone, msg);
        }

        await tx.serviceOrderHistory.create({
          data: { tenantId: ctx.tenantId, orderId: input.orderId, userId, previousStatus: order.status, newStatus: order.status, notes: "Documento enviado para assinatura digital" },
        });

        return { success: true, signatureLink: result.signatureLink };
      });
    }),

  verificarAssinatura: tenantProcedure
    .input(z.object({ orderId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      return ctx.withTenant(async (tx) => {
        const order = await tx.serviceOrder.findFirst({ where: { id: input.orderId, deletedAt: null } });
        if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "OS nao encontrada" });
        if (order.signatureSignedAt) return { signed: true, alreadySigned: true };
        if (!order.signatureDocumentId) throw new TRPCError({ code: "BAD_REQUEST", message: "Documento nao enviado" });

        const status = await autentiqueService.getDocumentStatus(order.signatureDocumentId);
        if (!status.success) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: status.error ?? "Erro ao consultar" });

        if (status.signed) {
          await tx.serviceOrder.update({
            where: { id: input.orderId },
            data: { signatureSignedAt: new Date() },
          });
          await tx.serviceOrderHistory.create({
            data: { tenantId: ctx.tenantId, orderId: input.orderId, userId, previousStatus: order.status, newStatus: order.status, notes: "Assinatura digital confirmada pelo cliente" },
          });
        }
        return { signed: status.signed, signaturesCompleted: status.signaturesCompleted };
      });
    }),

  confirmarAssinaturaFisica: tenantProcedure
    .input(z.object({ orderId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      return ctx.withTenant(async (tx) => {
        const order = await tx.serviceOrder.findFirst({ where: { id: input.orderId, deletedAt: null } });
        if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "OS nao encontrada" });
        await tx.serviceOrder.update({
          where: { id: input.orderId },
          data: { physicalSignature: true, signatureSignedAt: new Date() },
        });
        await tx.serviceOrderHistory.create({
          data: { tenantId: ctx.tenantId, orderId: input.orderId, userId, previousStatus: order.status, newStatus: order.status, notes: "Assinatura fisica confirmada" },
        });
        return { success: true };
      });
    }),

  // ── Termo de Entrega ──────────────────────────────────────────────────────
  enviarTermoEntrega: tenantProcedure
    .input(z.object({ orderId: z.string().uuid(), whatsapp: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      return ctx.withTenant(async (tx) => {
        const order = await tx.serviceOrder.findFirst({ where: { id: input.orderId, deletedAt: null } });
        if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "OS nao encontrada" });
        if (!["PAID", "READY_FOR_PICKUP", "DELIVERED"].includes(order.status)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Termo de entrega so pode ser enviado apos pagamento" });
        }
        const customer = await tx.customer.findFirst({ where: { id: order.customerId }, select: { name: true, phone: true } });
        const phone = input.whatsapp ?? customer?.phone;
        if (!phone) throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum telefone disponivel" });

        const pdfBuffer = Buffer.from("PDF Termo de Entrega placeholder");
        const result = await autentiqueService.createDocumentWithLink(
          `Termo de Entrega - OS #${order.number}`,
          [{ name: customer?.name ?? "Cliente", whatsapp: phone }],
          pdfBuffer,
        );

        if (!result.success) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.error ?? "Erro" });

        await tx.serviceOrder.update({
          where: { id: input.orderId },
          data: { deliveryTermSent: true, deliveryTermSentAt: new Date(), deliveryTermAutentiqueId: result.documentId, deliveryTermLink: result.signatureLink },
        });

        if (result.signatureLink) {
          const msg = `Termo de Entrega - OS #${order.number}\n\nOla, ${customer?.name ?? "Cliente"}! Para assinar digitalmente:\n${result.signatureLink}`;
          await whatsappService.sendTextMessage(phone, msg);
        }

        await tx.serviceOrderHistory.create({
          data: { tenantId: ctx.tenantId, orderId: input.orderId, userId, previousStatus: order.status, newStatus: order.status, notes: "Termo de entrega enviado para assinatura digital" },
        });
        return { success: true, signatureLink: result.signatureLink };
      });
    }),

  verificarTermoEntrega: tenantProcedure
    .input(z.object({ orderId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      return ctx.withTenant(async (tx) => {
        const order = await tx.serviceOrder.findFirst({ where: { id: input.orderId, deletedAt: null } });
        if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "OS nao encontrada" });
        if (order.deliveryTermSigned) return { signed: true, alreadySigned: true };
        if (!order.deliveryTermAutentiqueId) throw new TRPCError({ code: "BAD_REQUEST", message: "Termo nao enviado" });

        const status = await autentiqueService.getDocumentStatus(order.deliveryTermAutentiqueId);
        if (!status.success) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: status.error ?? "Erro" });

        if (status.signed) {
          await tx.serviceOrder.update({
            where: { id: input.orderId },
            data: { deliveryTermSigned: true, deliveryTermSignedAt: new Date(), status: "DELIVERED", deliveredDate: new Date() },
          });
          await tx.serviceOrderHistory.create({
            data: { tenantId: ctx.tenantId, orderId: input.orderId, userId, previousStatus: order.status, newStatus: "DELIVERED", notes: "Termo de entrega assinado digitalmente e equipamento entregue" },
          });
        }
        return { signed: status.signed, orderDelivered: status.signed };
      });
    }),

  confirmarTermoEntregaFisico: tenantProcedure
    .input(z.object({ orderId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      return ctx.withTenant(async (tx) => {
        const order = await tx.serviceOrder.findFirst({ where: { id: input.orderId, deletedAt: null } });
        if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "OS nao encontrada" });
        if (!["PAID", "READY_FOR_PICKUP"].includes(order.status)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Termo de entrega so pode ser confirmado apos pagamento" });
        }
        const prev = order.status;
        await tx.serviceOrder.update({
          where: { id: input.orderId },
          data: { deliveryTermSigned: true, deliveryTermPhysical: true, deliveryTermSignedAt: new Date(), status: "DELIVERED", deliveredDate: new Date() },
        });
        await tx.serviceOrderHistory.create({
          data: { tenantId: ctx.tenantId, orderId: input.orderId, userId, previousStatus: prev, newStatus: "DELIVERED", notes: "Assinatura fisica do termo de entrega confirmada e equipamento entregue" },
        });
        return { success: true };
      });
    }),

  // ── Termo de Devolucao ────────────────────────────────────────────────────
  enviarTermoDevolucao: tenantProcedure
    .input(z.object({ orderId: z.string().uuid(), motivo: z.string().optional(), whatsapp: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      return ctx.withTenant(async (tx) => {
        const order = await tx.serviceOrder.findFirst({ where: { id: input.orderId, deletedAt: null } });
        if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "OS nao encontrada" });
        const customer = await tx.customer.findFirst({ where: { id: order.customerId }, select: { name: true, phone: true } });
        const phone = input.whatsapp ?? customer?.phone;
        if (!phone) throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum telefone disponivel" });

        const pdfBuffer = Buffer.from("PDF Termo de Devolucao placeholder");
        const result = await autentiqueService.createDocumentWithLink(
          `Termo de Devolucao - OS #${order.number}`,
          [{ name: customer?.name ?? "Cliente", whatsapp: phone }],
          pdfBuffer,
        );
        if (!result.success) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.error ?? "Erro" });

        await tx.serviceOrder.update({
          where: { id: input.orderId },
          data: {
            returnTermSent: true, returnTermSentAt: new Date(), returnTermAutentiqueId: result.documentId, returnTermLink: result.signatureLink,
            cancellationReason: input.motivo ?? "Equipamento devolvido ao cliente",
          },
        });

        if (result.signatureLink) {
          const msg = `Termo de Devolucao - OS #${order.number}\n\nOla, ${customer?.name ?? "Cliente"}! Para assinar digitalmente:\n${result.signatureLink}`;
          await whatsappService.sendTextMessage(phone, msg);
        }

        await tx.serviceOrderHistory.create({
          data: { tenantId: ctx.tenantId, orderId: input.orderId, userId, previousStatus: order.status, newStatus: order.status, notes: `Termo de devolucao enviado. Motivo: ${input.motivo ?? "Equipamento devolvido"}` },
        });
        return { success: true, signatureLink: result.signatureLink };
      });
    }),

  verificarTermoDevolucao: tenantProcedure
    .input(z.object({ orderId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      return ctx.withTenant(async (tx) => {
        const order = await tx.serviceOrder.findFirst({ where: { id: input.orderId, deletedAt: null } });
        if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "OS nao encontrada" });
        if (order.returnTermSigned) return { signed: true, alreadySigned: true };
        if (!order.returnTermAutentiqueId) throw new TRPCError({ code: "BAD_REQUEST", message: "Termo nao enviado" });

        const status = await autentiqueService.getDocumentStatus(order.returnTermAutentiqueId);
        if (!status.success) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: status.error ?? "Erro" });

        if (status.signed) {
          const prev = order.status;
          await tx.serviceOrder.update({
            where: { id: input.orderId },
            data: { returnTermSigned: true, returnTermSignedAt: new Date(), status: "CANCELLED" },
          });
          await tx.serviceOrderHistory.create({
            data: { tenantId: ctx.tenantId, orderId: input.orderId, userId, previousStatus: prev, newStatus: "CANCELLED", notes: "Termo de devolucao assinado e OS cancelada" },
          });
        }
        return { signed: status.signed, osCancelled: status.signed };
      });
    }),

  confirmarTermoDevolucaoFisico: tenantProcedure
    .input(z.object({ orderId: z.string().uuid(), motivo: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      return ctx.withTenant(async (tx) => {
        const order = await tx.serviceOrder.findFirst({ where: { id: input.orderId, deletedAt: null } });
        if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "OS nao encontrada" });
        const prev = order.status;
        await tx.serviceOrder.update({
          where: { id: input.orderId },
          data: { returnTermSigned: true, returnTermPhysical: true, returnTermSignedAt: new Date(), status: "CANCELLED" },
        });
        await tx.serviceOrderHistory.create({
          data: { tenantId: ctx.tenantId, orderId: input.orderId, userId, previousStatus: prev, newStatus: "CANCELLED", notes: `Assinatura fisica do termo de devolucao confirmada e OS cancelada. Motivo: ${input.motivo ?? "Equipamento devolvido"}` },
        });
        return { success: true };
      });
    }),

  // ── Orcamento Adicional ───────────────────────────────────────────────────
  criarOrcamento: tenantProcedure
    .input(z.object({
      orderId: z.string().uuid(),
      newServiceAmount: z.number().min(0),
      newPartsAmount: z.number().min(0).optional(),
      newDiscount: z.number().min(0).optional(),
      reason: z.string().min(1, "Motivo obrigatorio"),
      additionalServices: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      return ctx.withTenant(async (tx) => {
        const order = await tx.serviceOrder.findFirst({ where: { id: input.orderId, deletedAt: null } });
        if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "OS nao encontrada" });
        if (order.budgetPending) throw new TRPCError({ code: "BAD_REQUEST", message: "Ja existe orcamento pendente" });
        if (["CANCELLED", "DELIVERED", "REFUNDED", "READY_FOR_PICKUP"].includes(order.status)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Nao e possivel criar orcamento neste status" });
        }

        const newTotal = (input.newServiceAmount) + (input.newPartsAmount ?? 0) - (input.newDiscount ?? 0);
        const approvalLink = crypto.randomBytes(16).toString("hex");

        const quote = await tx.serviceOrderQuote.create({
          data: {
            tenantId: ctx.tenantId,
            orderId: input.orderId,
            userId,
            previousServiceAmount: Number(order.serviceAmount),
            previousPartsAmount: Number(order.partsAmount),
            previousDiscount: Number(order.discount),
            previousTotal: Number(order.totalAmount),
            newServiceAmount: input.newServiceAmount,
            newPartsAmount: input.newPartsAmount ?? 0,
            newDiscount: input.newDiscount ?? 0,
            newTotal: Math.max(0, newTotal),
            reason: input.reason,
            additionalServices: input.additionalServices ?? null,
            approvalLink,
          },
        });

        await tx.serviceOrder.update({
          where: { id: input.orderId },
          data: { pendingQuoteId: quote.id, budgetPending: true },
        });

        await tx.serviceOrderHistory.create({
          data: { tenantId: ctx.tenantId, orderId: input.orderId, userId, previousStatus: order.status, newStatus: order.status, notes: `Novo orcamento criado. Motivo: ${input.reason}` },
        });

        return quote;
      });
    }),

  enviarOrcamento: tenantProcedure
    .input(z.object({ orderId: z.string().uuid(), whatsapp: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      return ctx.withTenant(async (tx) => {
        const order = await tx.serviceOrder.findFirst({ where: { id: input.orderId, deletedAt: null } });
        if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "OS nao encontrada" });
        if (!order.pendingQuoteId) throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum orcamento pendente" });

        const quote = await tx.serviceOrderQuote.findFirst({ where: { id: order.pendingQuoteId, status: "pending" } });
        if (!quote) throw new TRPCError({ code: "BAD_REQUEST", message: "Orcamento nao encontrado ou ja processado" });

        const customer = await tx.customer.findFirst({ where: { id: order.customerId }, select: { name: true, phone: true } });
        const phone = input.whatsapp ?? customer?.phone;
        if (!phone) throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum telefone disponivel" });

        const approvalUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://app.arenatechpi.com.br"}/quote/${quote.approvalLink}`;
        const valor = Number(quote.newTotal).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
        const msg = `Orcamento - OS #${order.number}\nValor: ${valor}\n\nPara aprovar ou rejeitar:\n${approvalUrl}`;

        await whatsappService.sendTextMessage(phone, msg);

        await tx.serviceOrderQuote.update({
          where: { id: quote.id },
          data: { sentToCustomer: true, sentAt: new Date() },
        });

        await tx.serviceOrderHistory.create({
          data: { tenantId: ctx.tenantId, orderId: input.orderId, userId, previousStatus: order.status, newStatus: order.status, notes: "Orcamento enviado para o cliente via WhatsApp" },
        });

        return { success: true, approvalUrl };
      });
    }),

  cancelarOrcamento: tenantProcedure
    .input(z.object({ orderId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      return ctx.withTenant(async (tx) => {
        const order = await tx.serviceOrder.findFirst({ where: { id: input.orderId, deletedAt: null } });
        if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "OS nao encontrada" });
        if (!order.pendingQuoteId) throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum orcamento pendente" });

        await tx.serviceOrderQuote.update({
          where: { id: order.pendingQuoteId },
          data: { status: "rejected", rejectedAt: new Date(), customerNotes: "Cancelado pela equipe interna" },
        });

        await tx.serviceOrder.update({
          where: { id: input.orderId },
          data: { pendingQuoteId: null, budgetPending: false },
        });

        await tx.serviceOrderHistory.create({
          data: { tenantId: ctx.tenantId, orderId: input.orderId, userId, previousStatus: order.status, newStatus: order.status, notes: "Orcamento cancelado pela equipe" },
        });
        return { success: true };
      });
    }),

  verificarOrcamento: tenantProcedure
    .input(z.object({ orderId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const order = await tx.serviceOrder.findFirst({ where: { id: input.orderId, deletedAt: null } });
        if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "OS nao encontrada" });
        const quotes = await tx.serviceOrderQuote.findMany({
          where: { orderId: input.orderId },
          orderBy: { createdAt: "desc" },
        });
        return quotes;
      });
    }),

  aprovarOrcamentoManual: tenantProcedure
    .input(z.object({ orderId: z.string().uuid(), quoteId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      return ctx.withTenant(async (tx) => {
        const quote = await tx.serviceOrderQuote.findFirst({ where: { id: input.quoteId, orderId: input.orderId, status: "pending" } });
        if (!quote) throw new TRPCError({ code: "NOT_FOUND", message: "Orcamento nao encontrado" });

        await tx.serviceOrderQuote.update({
          where: { id: quote.id },
          data: { status: "approved", approvedAt: new Date() },
        });

        await tx.serviceOrder.update({
          where: { id: input.orderId },
          data: {
            serviceAmount: Number(quote.newServiceAmount),
            partsAmount: Number(quote.newPartsAmount),
            discount: Number(quote.newDiscount),
            totalAmount: Number(quote.newTotal),
            pendingQuoteId: null,
            budgetPending: false,
          },
        });

        await tx.serviceOrderHistory.create({
          data: { tenantId: ctx.tenantId, orderId: input.orderId, userId, previousStatus: "OPEN", newStatus: "OPEN", notes: `Orcamento aprovado manualmente. Valor atualizado para R$ ${Number(quote.newTotal).toFixed(2)}` },
        });
        return { success: true };
      });
    }),

  // ── Orcamento Publico (sem auth) ──────────────────────────────────────────
  getQuotePublic: publicProcedure
    .input(z.object({ approvalLink: z.string().min(1) }))
    .query(async ({ input }) => {
      return withAdmin(async (tx) => {
        const quote = await tx.serviceOrderQuote.findFirst({
          where: { approvalLink: input.approvalLink },
          include: { order: { select: { number: true, deviceType: true, deviceModel: true, customerId: true, status: true } } },
        });
        if (!quote) throw new TRPCError({ code: "NOT_FOUND", message: "Orcamento nao encontrado" });

        const customer = await tx.customer.findFirst({
          where: { id: quote.order.customerId },
          select: { name: true },
        });

        return {
          id: quote.id,
          status: quote.status,
          orderNumber: quote.order.number,
          deviceType: quote.order.deviceType,
          deviceModel: quote.order.deviceModel,
          customerName: customer?.name ?? "-",
          previousTotal: Number(quote.previousTotal),
          newServiceAmount: Number(quote.newServiceAmount),
          newPartsAmount: Number(quote.newPartsAmount),
          newDiscount: Number(quote.newDiscount),
          newTotal: Number(quote.newTotal),
          reason: quote.reason,
          additionalServices: quote.additionalServices,
          createdAt: quote.createdAt,
        };
      });
    }),

  aprovarOrcamentoPublico: publicProcedure
    .input(z.object({ approvalLink: z.string().min(1), notes: z.string().optional() }))
    .mutation(async ({ input }) => {
      return withAdmin(async (tx) => {
        const quote = await tx.serviceOrderQuote.findFirst({
          where: { approvalLink: input.approvalLink, status: "pending" },
        });
        if (!quote) throw new TRPCError({ code: "NOT_FOUND", message: "Orcamento nao encontrado ou ja processado" });

        await tx.serviceOrderQuote.update({
          where: { id: quote.id },
          data: { status: "approved", approvedAt: new Date(), customerNotes: input.notes ?? null },
        });

        await tx.serviceOrder.update({
          where: { id: quote.orderId },
          data: {
            serviceAmount: Number(quote.newServiceAmount),
            partsAmount: Number(quote.newPartsAmount),
            discount: Number(quote.newDiscount),
            totalAmount: Number(quote.newTotal),
            pendingQuoteId: null,
            budgetPending: false,
          },
        });

        await tx.serviceOrderHistory.create({
          data: { tenantId: quote.tenantId, orderId: quote.orderId, userId: quote.userId, previousStatus: "OPEN", newStatus: "OPEN", notes: `Orcamento aprovado pelo cliente via link publico` },
        });
        return { success: true };
      });
    }),

  rejeitarOrcamentoPublico: publicProcedure
    .input(z.object({ approvalLink: z.string().min(1), notes: z.string().optional() }))
    .mutation(async ({ input }) => {
      return withAdmin(async (tx) => {
        const quote = await tx.serviceOrderQuote.findFirst({
          where: { approvalLink: input.approvalLink, status: "pending" },
        });
        if (!quote) throw new TRPCError({ code: "NOT_FOUND", message: "Orcamento nao encontrado ou ja processado" });

        await tx.serviceOrderQuote.update({
          where: { id: quote.id },
          data: { status: "rejected", rejectedAt: new Date(), customerNotes: input.notes ?? null },
        });

        await tx.serviceOrder.update({
          where: { id: quote.orderId },
          data: { pendingQuoteId: null, budgetPending: false },
        });

        await tx.serviceOrderHistory.create({
          data: { tenantId: quote.tenantId, orderId: quote.orderId, userId: quote.userId, previousStatus: "OPEN", newStatus: "OPEN", notes: `Orcamento REJEITADO pelo cliente. Motivo: ${input.notes ?? "Nao informado"}` },
        });
        return { success: true };
      });
    }),

  // ── WhatsApp / Notificacoes ───────────────────────────────────────────────
  notificarConclusao: tenantProcedure
    .input(z.object({ orderId: z.string().uuid(), telefone: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      return ctx.withTenant(async (tx) => {
        const order = await tx.serviceOrder.findFirst({ where: { id: input.orderId, deletedAt: null } });
        if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "OS nao encontrada" });
        if (!["COMPLETED", "PAID", "READY_FOR_PICKUP"].includes(order.status)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Notificacao so pode ser enviada quando a OS estiver concluida" });
        }
        const customer = await tx.customer.findFirst({ where: { id: order.customerId }, select: { name: true, phone: true } });
        const phone = input.telefone ?? customer?.phone;
        if (!phone) throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum telefone disponivel" });

        const equipamento = [order.deviceType, order.deviceModel].filter(Boolean).join(" ");
        const msg = `Aparelho Pronto - Arena Tech\n\nOla, ${customer?.name ?? "Cliente"}!\n\nSeu aparelho (${equipamento}) da OS #${order.number} foi concluido e esta pronto para retirada.\n\nHorario de funcionamento:\nSegunda a Sabado: 09h as 21h\n\nArena Tech`;

        const result = await whatsappService.sendTextMessage(phone, msg);
        if (!result.success) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.error ?? "Erro ao enviar WhatsApp" });

        await tx.serviceOrderHistory.create({
          data: { tenantId: ctx.tenantId, orderId: input.orderId, userId, previousStatus: order.status, newStatus: order.status, notes: "Notificacao de conclusao enviada via WhatsApp" },
        });
        return { success: true };
      });
    }),

  enviarRecibo: tenantProcedure
    .input(z.object({ orderId: z.string().uuid(), whatsapp: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      return ctx.withTenant(async (tx) => {
        const order = await tx.serviceOrder.findFirst({ where: { id: input.orderId, deletedAt: null } });
        if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "OS nao encontrada" });
        if (!["PAID", "READY_FOR_PICKUP", "DELIVERED"].includes(order.status)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Recibo so pode ser enviado apos pagamento" });
        }
        const customer = await tx.customer.findFirst({ where: { id: order.customerId }, select: { name: true, phone: true } });
        const phone = input.whatsapp ?? customer?.phone;
        if (!phone) throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum telefone disponivel" });

        const receiptUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/service-orders/${order.id}/receipt`;
        const msg = `Recibo - OS #${order.number}\nOla, ${customer?.name ?? "Cliente"}! Segue o recibo do servico realizado.\n\nAcesse: ${receiptUrl}\n\nArena Tech`;

        await whatsappService.sendTextMessage(phone, msg);

        await tx.serviceOrder.update({
          where: { id: input.orderId },
          data: { receiptSent: true, receiptSentAt: new Date() },
        });

        await tx.serviceOrderHistory.create({
          data: { tenantId: ctx.tenantId, orderId: input.orderId, userId, previousStatus: order.status, newStatus: order.status, notes: "Recibo enviado para o cliente via WhatsApp" },
        });
        return { success: true };
      });
    }),

  enviarRastreamento: tenantProcedure
    .input(z.object({ orderId: z.string().uuid(), telefone: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      return ctx.withTenant(async (tx) => {
        const order = await tx.serviceOrder.findFirst({ where: { id: input.orderId, deletedAt: null } });
        if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "OS nao encontrada" });
        if (!order.publicLink) throw new TRPCError({ code: "BAD_REQUEST", message: "OS sem link publico" });

        const customer = await tx.customer.findFirst({ where: { id: order.customerId }, select: { name: true } });
        const trackUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/os/${order.publicLink}`;
        const msg = `Ola, ${customer?.name ?? "Cliente"}!\n\nSua Ordem de Servico ${order.number} foi aberta. Acompanhe o status em tempo real:\n${trackUrl}\n\nArena Tech`;

        const result = await whatsappService.sendTextMessage(input.telefone, msg);
        if (!result.success) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.error ?? "Erro ao enviar WhatsApp" });

        await tx.serviceOrderHistory.create({
          data: { tenantId: ctx.tenantId, orderId: input.orderId, userId, previousStatus: order.status, newStatus: order.status, notes: "Link de rastreamento enviado via WhatsApp" },
        });
        return { success: true };
      });
    }),

  // ── Laboratorio Externo ───────────────────────────────────────────────────
  enviarParaLaboratorio: tenantProcedure
    .input(z.object({ orderId: z.string().uuid(), deliveryPersonId: z.string().uuid().optional() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      return ctx.withTenant(async (tx) => {
        const order = await tx.serviceOrder.findFirst({ where: { id: input.orderId, deletedAt: null } });
        if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "OS nao encontrada" });
        await tx.serviceOrder.update({
          where: { id: input.orderId },
          data: { sentToLab: true, labReceived: false, deliveryPersonId: input.deliveryPersonId ?? null },
        });
        await tx.serviceOrderHistory.create({
          data: { tenantId: ctx.tenantId, orderId: input.orderId, userId, previousStatus: order.status, newStatus: order.status, notes: "Equipamento enviado para laboratorio externo" },
        });
        return { success: true };
      });
    }),

  confirmarRecebimentoLaboratorio: tenantProcedure
    .input(z.object({ orderId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      return ctx.withTenant(async (tx) => {
        const order = await tx.serviceOrder.findFirst({ where: { id: input.orderId, deletedAt: null } });
        if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "OS nao encontrada" });
        if (!order.sentToLab) throw new TRPCError({ code: "BAD_REQUEST", message: "Equipamento nao foi enviado para laboratorio" });
        await tx.serviceOrder.update({ where: { id: input.orderId }, data: { labReceived: true } });
        await tx.serviceOrderHistory.create({
          data: { tenantId: ctx.tenantId, orderId: input.orderId, userId, previousStatus: order.status, newStatus: order.status, notes: "Equipamento recebido de volta do laboratorio externo" },
        });
        return { success: true };
      });
    }),

  cancelarEnvioLaboratorio: tenantProcedure
    .input(z.object({ orderId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      return ctx.withTenant(async (tx) => {
        const order = await tx.serviceOrder.findFirst({ where: { id: input.orderId, deletedAt: null } });
        if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "OS nao encontrada" });
        await tx.serviceOrder.update({ where: { id: input.orderId }, data: { sentToLab: false, labReceived: false, deliveryPersonId: null } });
        await tx.serviceOrderHistory.create({
          data: { tenantId: ctx.tenantId, orderId: input.orderId, userId, previousStatus: order.status, newStatus: order.status, notes: "Envio para laboratorio cancelado" },
        });
        return { success: true };
      });
    }),

  // ── Info Tecnicas e Custos inline ─────────────────────────────────────────
  atualizarTecnico: tenantProcedure
    .input(z.object({ orderId: z.string().uuid(), technicianId: z.string().uuid().nullable() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      return ctx.withTenant(async (tx) => {
        const order = await tx.serviceOrder.findFirst({ where: { id: input.orderId, deletedAt: null } });
        if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "OS nao encontrada" });
        await tx.serviceOrder.update({ where: { id: input.orderId }, data: { technicianId: input.technicianId } });
        await tx.serviceOrderHistory.create({
          data: { tenantId: ctx.tenantId, orderId: input.orderId, userId, previousStatus: order.status, newStatus: order.status, notes: "Tecnico responsavel atualizado" },
        });
        return { success: true };
      });
    }),

  // ── Consultas ─────────────────────────────────────────────────────────────
  ordensDoCliente: tenantProcedure
    .input(z.object({ customerId: z.string().uuid(), page: z.number().int().min(0).optional(), pageSize: z.number().int().min(1).max(50).optional() }))
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const take = input.pageSize ?? 10;
        const skip = (input.page ?? 0) * take;
        const [items, total] = await Promise.all([
          tx.serviceOrder.findMany({ where: { customerId: input.customerId, deletedAt: null }, orderBy: { entryDate: "desc" }, skip, take }),
          tx.serviceOrder.count({ where: { customerId: input.customerId, deletedAt: null } }),
        ]);
        return { items, total };
      });
    }),

  buscarPecas: tenantProcedure
    .input(z.object({ search: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        return tx.product.findMany({
          where: {
            active: true,
            deletedAt: null,
            ...(input.search ? { name: { contains: input.search, mode: "insensitive" as const } } : {}),
          },
          select: { id: true, name: true, salePrice: true, costPrice: true, currentStock: true },
          take: 20,
          orderBy: { name: "asc" },
        });
      });
    }),

  // ── PIX Depix ─────────────────────────────────────────────────────────────
  gerarPixDepix: tenantProcedure
    .input(z.object({ orderId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      return ctx.withTenant(async (tx) => {
        const order = await tx.serviceOrder.findFirst({ where: { id: input.orderId, deletedAt: null } });
        if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "OS nao encontrada" });
        if (Number(order.totalAmount) <= 0) throw new TRPCError({ code: "BAD_REQUEST", message: "OS sem valor" });

        const result = await depixService.createPixPayment(
          Number(order.totalAmount),
          `OS ${order.number}`,
          order.id,
        );

        if (!result.success) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.error ?? "Erro ao gerar PIX" });

        await tx.serviceOrder.update({
          where: { id: input.orderId },
          data: { depixTransactionId: result.transactionId, depixStatus: "pending" },
        });

        await tx.serviceOrderHistory.create({
          data: { tenantId: ctx.tenantId, orderId: input.orderId, userId, previousStatus: order.status, newStatus: order.status, notes: "QR Code PIX gerado" },
        });

        return { success: true, qrCode: result.qrCode, qrCodeBase64: result.qrCodeBase64, pixKey: result.pixKey, transactionId: result.transactionId };
      });
    }),

  cancelarPixDepix: tenantProcedure
    .input(z.object({ orderId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      return ctx.withTenant(async (tx) => {
        const order = await tx.serviceOrder.findFirst({ where: { id: input.orderId, deletedAt: null } });
        if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "OS nao encontrada" });
        if (!order.depixTransactionId) throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum PIX pendente" });

        const result = await depixService.cancelPixPayment(order.depixTransactionId);
        if (!result.success) {
          logger.warn("Depix cancel failed", { error: result.error });
        }

        await tx.serviceOrder.update({
          where: { id: input.orderId },
          data: { depixTransactionId: null, depixStatus: null },
        });

        await tx.serviceOrderHistory.create({
          data: { tenantId: ctx.tenantId, orderId: input.orderId, userId, previousStatus: order.status, newStatus: order.status, notes: "PIX cancelado" },
        });
        return { success: true };
      });
    }),
});
