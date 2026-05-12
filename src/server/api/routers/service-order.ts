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
  ALLOWED_TRANSITIONS,
  type ServiceOrderStatusValue,
} from "@/lib/validators/service-order";
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
              select: { id: true, name: true, cpf: true },
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

        // Fetch technician and history users via admin
        const userIds = [
          order.createdById,
          order.technicianId,
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
});
