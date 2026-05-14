import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Prisma } from "@prisma/client";
import { createTRPCRouter, tenantProcedure, publicProcedure } from "@/server/api/trpc";
import { withAdmin } from "@/server/db";
import { createDocumentWithLink, getDocumentStatus, formatWhatsApp } from "@/lib/services/autentique-service";
import { logger } from "@/lib/logger";
import {
  createServiceOrderSchema,
  updateServiceOrderSchema,
  updateStatusSchema,
  addItemSchema,
  updateItemSchema,
  registerPaymentSchema,
  cancelOrderSchema,
  uncancelOrderSchema,
  refundOrderSchema,
  updateCostsSchema,
  listServiceOrdersSchema,
  createQuoteSchema,
  respondQuoteSchema,
  confirmPhysicalSignatureSchema,
  sendToLabSchema,
  receiveFromLabSchema,
  cancelLabSchema,
  ALLOWED_TRANSITIONS,
  type ServiceOrderStatus,
} from "@/lib/validators/service-order";
import { technicianReportSchema } from "@/lib/validators/subscription";

// ── Helpers ──

function decimalToCents(v: Prisma.Decimal | null | undefined): number {
  if (v == null) return 0;
  return Math.round(Number(v) * 100);
}

function centsToPrisma(cents: number): Prisma.Decimal {
  return new Prisma.Decimal(cents / 100);
}

function generatePublicLink(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 12; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function generateQuoteLink(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 16; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

 
function serializeOrder(order: any) {
  return {
    ...order,
    serviceAmount: decimalToCents(order.serviceAmount),
    partsAmount: decimalToCents(order.partsAmount),
    partsCost: decimalToCents(order.partsCost),
    discount: decimalToCents(order.discount),
    totalAmount: decimalToCents(order.totalAmount),
    paidAmount: decimalToCents(order.paidAmount),
    otherCost: decimalToCents(order.otherCost),
    paymentDiscount: decimalToCents(order.paymentDiscount),
    items: order.items?.map(serializeItem) ?? [],
    quotes: order.quotes?.map(serializeQuote) ?? [],
  };
}

 
function serializeItem(item: any) {
  return {
    ...item,
    quantity: Number(item.quantity),
    unitPrice: decimalToCents(item.unitPrice),
    costPrice: decimalToCents(item.costPrice),
    total: decimalToCents(item.total),
  };
}

 
function serializeQuote(q: any) {
  return {
    ...q,
    previousServiceAmount: decimalToCents(q.previousServiceAmount),
    previousPartsAmount: decimalToCents(q.previousPartsAmount),
    previousDiscount: decimalToCents(q.previousDiscount),
    previousTotal: decimalToCents(q.previousTotal),
    newServiceAmount: decimalToCents(q.newServiceAmount),
    newPartsAmount: decimalToCents(q.newPartsAmount),
    newDiscount: decimalToCents(q.newDiscount),
    newTotal: decimalToCents(q.newTotal),
  };
}

export const serviceOrderRouter = createTRPCRouter({
  // ── LIST ──
  list: tenantProcedure
    .input(listServiceOrdersSchema)
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const page = input.page ?? 0;
        const pageSize = input.pageSize ?? 10;
        const skip = page * pageSize;

         
        const where: any = { deletedAt: null };

        if (input.status) {
          where.status = input.status;
        }
        if (input.technicianId) {
          where.technicianId = input.technicianId;
        }
        if (input.dateFrom) {
          where.entryDate = { ...(where.entryDate ?? {}), gte: new Date(input.dateFrom) };
        }
        if (input.dateTo) {
          where.entryDate = { ...(where.entryDate ?? {}), lte: new Date(input.dateTo + "T23:59:59Z") };
        }

        // Search by number, customer name, CPF, IMEI, model
        if (input.search) {
          const search = input.search.trim();
          // Try to find matching customer IDs first
          const matchingCustomers = await tx.customer.findMany({
            where: {
              deletedAt: null,
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { cpf: { contains: search.replace(/\D/g, "") } },
              ],
            },
            select: { id: true },
          });

          const customerIds = matchingCustomers.map((c) => c.id);

          where.OR = [
            { number: { contains: search, mode: "insensitive" } },
            { imei: { contains: search } },
            { deviceModel: { contains: search, mode: "insensitive" } },
            ...(customerIds.length > 0 ? [{ customerId: { in: customerIds } }] : []),
          ];
        }

        // Determine ordering
         
        let orderBy: any = { entryDate: "desc" };
        if (input.sortBy === "number") orderBy = { number: input.sortOrder ?? "desc" };
        if (input.sortBy === "totalAmount") orderBy = { totalAmount: input.sortOrder ?? "desc" };
        if (input.sortBy === "status") orderBy = { status: input.sortOrder ?? "asc" };

        const [orders, total] = await Promise.all([
          tx.serviceOrder.findMany({
            where,
            include: {
              items: true,
            },
            orderBy,
            skip,
            take: pageSize,
          }),
          tx.serviceOrder.count({ where }),
        ]);

        // Load customer names separately (customer is cross-table via customerId)
        const customerIds = [...new Set(orders.map((o) => o.customerId))];
        const customers = await tx.customer.findMany({
          where: { id: { in: customerIds } },
          select: { id: true, name: true, cpf: true, phone: true },
        });
        const customerMap = new Map(customers.map((c) => [c.id, c]));

        // Load technician names via withAdmin (users are global)
        const techIds = [...new Set(orders.map((o) => o.technicianId).filter(Boolean))] as string[];
        let techMap = new Map<string, string>();
        if (techIds.length > 0) {
          const techs = await withAdmin(async (adminTx) => {
            return adminTx.user.findMany({
              where: { id: { in: techIds } },
              select: { id: true, name: true },
            });
          });
          techMap = new Map(techs.map((t) => [t.id, t.name]));
        }

        return {
          items: orders.map((order) => ({
            ...serializeOrder(order),
            customerName: customerMap.get(order.customerId)?.name ?? "—",
            customerCpf: customerMap.get(order.customerId)?.cpf ?? null,
            customerPhone: customerMap.get(order.customerId)?.phone ?? null,
            technicianName: order.technicianId ? (techMap.get(order.technicianId) ?? "—") : null,
          })),
          total,
          page,
          pageSize,
          totalPages: Math.ceil(total / pageSize),
        };
      });
    }),

  // ── STATS ──
  stats: tenantProcedure.query(async ({ ctx }) => {
    return ctx.withTenant(async (tx) => {
      const counts = await tx.serviceOrder.groupBy({
        by: ["status"],
        where: { deletedAt: null },
        _count: true,
      });

      const countMap: Record<string, number> = {};
      let totalCount = 0;
      for (const c of counts) {
        countMap[c.status] = c._count;
        totalCount += c._count;
      }

      return {
        total: totalCount,
        open: countMap["OPEN"] ?? 0,
        inProgress: (countMap["IN_DIAGNOSIS"] ?? 0) + (countMap["IN_PROGRESS"] ?? 0) + (countMap["APPROVED"] ?? 0),
        waitingParts: countMap["WAITING_PARTS"] ?? 0,
        waitingApproval: countMap["WAITING_APPROVAL"] ?? 0,
        completed: countMap["COMPLETED"] ?? 0,
        readyForPickup: (countMap["PAID"] ?? 0) + (countMap["READY_FOR_PICKUP"] ?? 0),
        delivered: countMap["DELIVERED"] ?? 0,
        cancelled: (countMap["CANCELLED"] ?? 0) + (countMap["REFUNDED"] ?? 0),
      };
    });
  }),

  // ── GET BY ID ──
  getById: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const order = await tx.serviceOrder.findUnique({
          where: { id: input.id },
          include: {
            items: { orderBy: { createdAt: "asc" } },
            history: { orderBy: { createdAt: "desc" } },
            documents: { orderBy: { createdAt: "desc" } },
            quotes: { orderBy: { createdAt: "desc" } },
          },
        });

        if (!order || order.deletedAt) {
          throw new TRPCError({ code: "NOT_FOUND", message: "OS nao encontrada" });
        }

        // Load customer
        const customer = await tx.customer.findUnique({
          where: { id: order.customerId },
          select: { id: true, name: true, cpf: true, cnpj: true, phone: true, email: true },
        });

        // Load users (technician, created by, vendor) via withAdmin
        const userIds = [order.createdById, order.technicianId, order.vendorId, order.refundedById].filter(Boolean) as string[];
        const historyUserIds = order.history.map((h) => h.userId);
        const allUserIds = [...new Set([...userIds, ...historyUserIds])];

        let userMap = new Map<string, string>();
        if (allUserIds.length > 0) {
          const users = await withAdmin(async (adminTx) => {
            return adminTx.user.findMany({
              where: { id: { in: allUserIds } },
              select: { id: true, name: true },
            });
          });
          userMap = new Map(users.map((u) => [u.id, u.name]));
        }

        return {
          ...serializeOrder(order),
          customer,
          createdByName: userMap.get(order.createdById) ?? "Sistema",
          technicianName: order.technicianId ? (userMap.get(order.technicianId) ?? null) : null,
          vendorName: order.vendorId ? (userMap.get(order.vendorId) ?? null) : null,
          refundedByName: order.refundedById ? (userMap.get(order.refundedById) ?? null) : null,
          history: order.history.map((h) => ({
            ...h,
            userName: userMap.get(h.userId) ?? "Sistema",
          })),
        };
      });
    }),

  // ── CREATE ──
  create: tenantProcedure
    .input(createServiceOrderSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        // Generate sequential number
        const year = new Date().getFullYear();
        const lastOrder = await tx.serviceOrder.findFirst({
          where: { number: { startsWith: `OS${year}` } },
          orderBy: { number: "desc" },
          select: { number: true },
        });

        let seq = 1;
        if (lastOrder) {
          const lastSeq = parseInt(lastOrder.number.replace(`OS${year}`, ""), 10);
          if (!isNaN(lastSeq)) seq = lastSeq + 1;
        }
        const number = `OS${year}${String(seq).padStart(5, "0")}`;

        // Calculate totals from items
        let serviceAmount = 0;
        let partsAmount = 0;
        for (const item of input.items) {
          const total = item.unitPrice * item.quantity;
          if (item.type === "SERVICE") serviceAmount += total;
          else partsAmount += total;
        }
        const totalAmount = serviceAmount + partsAmount;

        const order = await tx.serviceOrder.create({
          data: {
            tenantId: ctx.tenantId,
            number,
            customerId: input.customerId,
            createdById: ctx.session.user.id,
            technicianId: input.technicianId ?? null,
            vendorId: input.vendorId ?? null,
            status: "OPEN",
            publicLink: generatePublicLink(),
            deviceType: input.deviceType ?? null,
            deviceBrand: input.deviceBrand ?? null,
            deviceModel: input.deviceModel ?? null,
            serialNumber: input.serialNumber ?? null,
            imei: input.imei ?? null,
            devicePassword: input.devicePassword ?? null,
            accessories: input.accessories ?? null,
            reportedProblem: input.reportedProblem,
            customerNotes: input.customerNotes ?? null,
            entryChecklist: input.entryChecklist ?? Prisma.JsonNull,
            deviceInfo: input.deviceInfo ?? Prisma.JsonNull,
            serviceAmount: centsToPrisma(serviceAmount),
            partsAmount: centsToPrisma(partsAmount),
            totalAmount: centsToPrisma(totalAmount),
            isWarranty: input.isWarranty ?? false,
            warrantyType: input.warrantyType ?? null,
            warrantyMonths: input.warrantyMonths ?? 3,
            originalOrderId: input.originalOrderId ?? null,
            estimatedDate: input.estimatedDate ? new Date(input.estimatedDate) : null,
          },
        });

        // Create items
        if (input.items.length > 0) {
          await tx.serviceOrderItem.createMany({
            data: input.items.map((item) => ({
              tenantId: ctx.tenantId,
              orderId: order.id,
              type: item.type,
              serviceId: item.serviceId ?? null,
              productId: item.productId ?? null,
              description: item.description,
              quantity: new Prisma.Decimal(item.quantity),
              unitPrice: centsToPrisma(item.unitPrice),
              costPrice: centsToPrisma(item.costPrice ?? 0),
              total: centsToPrisma(item.unitPrice * item.quantity),
            })),
          });
        }

        // Create history entry
        await tx.serviceOrderHistory.create({
          data: {
            tenantId: ctx.tenantId,
            orderId: order.id,
            userId: ctx.session.user.id,
            previousStatus: null,
            newStatus: "OPEN",
            notes: "Ordem de servico criada",
          },
        });

        return { id: order.id, number: order.number };
      });
    }),

  // ── UPDATE ──
  update: tenantProcedure
    .input(updateServiceOrderSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const order = await tx.serviceOrder.findUnique({ where: { id: input.id } });
        if (!order || order.deletedAt) {
          throw new TRPCError({ code: "NOT_FOUND", message: "OS nao encontrada" });
        }

        const { id, ...data } = input;

        // Build update data, converting dates and handling null
         
        const updateData: any = {};
        for (const [key, value] of Object.entries(data)) {
          if (value === undefined) continue;
          if (key === "estimatedDate") {
            updateData[key] = value ? new Date(value as string) : null;
          } else if (key === "entryChecklist" || key === "exitChecklist" || key === "deviceInfo") {
            updateData[key] = value ?? Prisma.JsonNull;
          } else {
            updateData[key] = value;
          }
        }

        await tx.serviceOrder.update({ where: { id }, data: updateData });

        // History
        await tx.serviceOrderHistory.create({
          data: {
            tenantId: ctx.tenantId,
            orderId: id,
            userId: ctx.session.user.id,
            previousStatus: order.status,
            newStatus: order.status,
            notes: "Dados da OS atualizados",
          },
        });

        return { success: true };
      });
    }),

  // ── UPDATE STATUS ──
  updateStatus: tenantProcedure
    .input(updateStatusSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const order = await tx.serviceOrder.findUnique({ where: { id: input.id } });
        if (!order || order.deletedAt) {
          throw new TRPCError({ code: "NOT_FOUND", message: "OS nao encontrada" });
        }

        const currentStatus = order.status as ServiceOrderStatus;
        const newStatus = input.status;

        // Validate transition
        const allowed = ALLOWED_TRANSITIONS[currentStatus] ?? [];
        if (!allowed.includes(newStatus)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Transicao de ${currentStatus} para ${newStatus} nao permitida`,
          });
        }

        // Block completion if device is at external lab and not returned
        if (newStatus === "COMPLETED" && order.sentToLab && !order.labReceived) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "O aparelho esta no laboratorio externo. Confirme o recebimento antes de concluir.",
          });
        }

        // Block if pending quote
        if (order.budgetPending) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Nao e possivel alterar o status enquanto houver orcamento pendente.",
          });
        }

         
        const updateData: any = { status: newStatus };

        if (newStatus === "COMPLETED") {
          updateData.completedDate = new Date();
        }

        if (newStatus === "DELIVERED") {
          updateData.deliveredDate = new Date();
        }

        if (newStatus === "PAID") {
          updateData.paymentDate = new Date();
          if (input.paymentMethod) updateData.paymentMethod = input.paymentMethod;
          if (input.paymentNotes) updateData.paymentNotes = input.paymentNotes;
          if (input.paymentDiscount) {
            updateData.paymentDiscount = centsToPrisma(input.paymentDiscount);
            const paid = Number(order.totalAmount) - input.paymentDiscount / 100;
            updateData.paidAmount = new Prisma.Decimal(Math.max(0, paid));
          } else {
            updateData.paidAmount = order.totalAmount;
          }
        }

        if (input.warrantyMonths !== undefined) {
          updateData.warrantyMonths = input.warrantyMonths;
        }

        await tx.serviceOrder.update({ where: { id: input.id }, data: updateData });

        await tx.serviceOrderHistory.create({
          data: {
            tenantId: ctx.tenantId,
            orderId: input.id,
            userId: ctx.session.user.id,
            previousStatus: currentStatus,
            newStatus,
            notes: input.notes ?? null,
          },
        });

        return { success: true };
      });
    }),

  // ── CANCEL ──
  cancel: tenantProcedure
    .input(cancelOrderSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const order = await tx.serviceOrder.findUnique({ where: { id: input.id } });
        if (!order || order.deletedAt) {
          throw new TRPCError({ code: "NOT_FOUND", message: "OS nao encontrada" });
        }

        if (["COMPLETED", "DELIVERED"].includes(order.status)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Nao e possivel cancelar uma OS concluida ou entregue.",
          });
        }

        await tx.serviceOrder.update({
          where: { id: input.id },
          data: {
            status: "CANCELLED",
            cancellationReason: input.reason,
          },
        });

        await tx.serviceOrderHistory.create({
          data: {
            tenantId: ctx.tenantId,
            orderId: input.id,
            userId: ctx.session.user.id,
            previousStatus: order.status,
            newStatus: "CANCELLED",
            notes: input.reason,
          },
        });

        return { success: true };
      });
    }),

  // ── UNCANCEL (admin only) ──
  uncancel: tenantProcedure
    .input(uncancelOrderSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const order = await tx.serviceOrder.findUnique({ where: { id: input.id } });
        if (!order) throw new TRPCError({ code: "NOT_FOUND" });

        if (order.status !== "CANCELLED") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Apenas OS canceladas podem ser descanceladas." });
        }

        await tx.serviceOrder.update({
          where: { id: input.id },
          data: {
            status: "IN_DIAGNOSIS",
            cancellationReason: null,
          },
        });

        await tx.serviceOrderHistory.create({
          data: {
            tenantId: ctx.tenantId,
            orderId: input.id,
            userId: ctx.session.user.id,
            previousStatus: "CANCELLED",
            newStatus: "IN_DIAGNOSIS",
            notes: `[DESCANCELAMENTO] ${input.reason}`,
          },
        });

        return { success: true };
      });
    }),

  // ── REFUND (admin only) ──
  refund: tenantProcedure
    .input(refundOrderSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const order = await tx.serviceOrder.findUnique({ where: { id: input.id } });
        if (!order) throw new TRPCError({ code: "NOT_FOUND" });

        if (order.status !== "DELIVERED") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Apenas OS entregues podem ser estornadas." });
        }

        await tx.serviceOrder.update({
          where: { id: input.id },
          data: {
            status: "REFUNDED",
            refundReason: input.reason,
            refundedAt: new Date(),
            refundedById: ctx.session.user.id,
          },
        });

        await tx.serviceOrderHistory.create({
          data: {
            tenantId: ctx.tenantId,
            orderId: input.id,
            userId: ctx.session.user.id,
            previousStatus: "DELIVERED",
            newStatus: "REFUNDED",
            notes: `[ESTORNO] ${input.reason}`,
          },
        });

        return { success: true };
      });
    }),

  // ── DELETE (admin only, permanent) ──
  delete: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const order = await tx.serviceOrder.findUnique({ where: { id: input.id } });
        if (!order) throw new TRPCError({ code: "NOT_FOUND" });

        // Soft delete
        await tx.serviceOrder.update({
          where: { id: input.id },
          data: { deletedAt: new Date() },
        });

        return { success: true };
      });
    }),

  // ── ADD ITEM ──
  addItem: tenantProcedure
    .input(addItemSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const order = await tx.serviceOrder.findUnique({ where: { id: input.orderId } });
        if (!order || order.deletedAt) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }

        const itemTotal = input.unitPrice * input.quantity;

        await tx.serviceOrderItem.create({
          data: {
            tenantId: ctx.tenantId,
            orderId: input.orderId,
            type: input.type,
            serviceId: input.serviceId ?? null,
            productId: input.productId ?? null,
            description: input.description,
            quantity: new Prisma.Decimal(input.quantity),
            unitPrice: centsToPrisma(input.unitPrice),
            costPrice: centsToPrisma(input.costPrice ?? 0),
            total: centsToPrisma(itemTotal),
          },
        });

        // Recalculate totals
        await recalculateOrderTotals(tx, input.orderId, ctx.tenantId);

        await tx.serviceOrderHistory.create({
          data: {
            tenantId: ctx.tenantId,
            orderId: input.orderId,
            userId: ctx.session.user.id,
            previousStatus: order.status,
            newStatus: order.status,
            notes: `Item adicionado: ${input.description}`,
          },
        });

        return { success: true };
      });
    }),

  // ── UPDATE ITEM ──
  updateItem: tenantProcedure
    .input(updateItemSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const item = await tx.serviceOrderItem.findUnique({ where: { id: input.id } });
        if (!item) throw new TRPCError({ code: "NOT_FOUND" });

        const quantity = input.quantity ?? Number(item.quantity);
        const unitPrice = input.unitPrice !== undefined ? input.unitPrice : decimalToCents(item.unitPrice);
        const total = unitPrice * quantity;

        await tx.serviceOrderItem.update({
          where: { id: input.id },
          data: {
            description: input.description ?? undefined,
            quantity: input.quantity !== undefined ? new Prisma.Decimal(input.quantity) : undefined,
            unitPrice: input.unitPrice !== undefined ? centsToPrisma(input.unitPrice) : undefined,
            costPrice: input.costPrice !== undefined ? centsToPrisma(input.costPrice) : undefined,
            total: centsToPrisma(total),
          },
        });

        await recalculateOrderTotals(tx, item.orderId, item.tenantId);
        return { success: true };
      });
    }),

  // ── REMOVE ITEM ──
  removeItem: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const item = await tx.serviceOrderItem.findUnique({ where: { id: input.id } });
        if (!item) throw new TRPCError({ code: "NOT_FOUND" });

        await tx.serviceOrderItem.delete({ where: { id: input.id } });
        await recalculateOrderTotals(tx, item.orderId, item.tenantId);

        return { success: true };
      });
    }),

  // ── REGISTER PAYMENT ──
  registerPayment: tenantProcedure
    .input(registerPaymentSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const order = await tx.serviceOrder.findUnique({ where: { id: input.id } });
        if (!order || order.deletedAt) throw new TRPCError({ code: "NOT_FOUND" });

        if (order.status !== "COMPLETED") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Pagamento so pode ser registrado em OS concluida.",
          });
        }

        const discount = input.paymentDiscount ?? 0;

        await tx.serviceOrder.update({
          where: { id: input.id },
          data: {
            status: "PAID",
            paymentMethod: input.paymentMethod,
            paidAmount: centsToPrisma(input.paidAmount),
            paymentDiscount: centsToPrisma(discount),
            paymentNotes: input.paymentNotes ?? null,
            paymentDate: new Date(),
          },
        });

        await tx.serviceOrderHistory.create({
          data: {
            tenantId: ctx.tenantId,
            orderId: input.id,
            userId: ctx.session.user.id,
            previousStatus: order.status,
            newStatus: "PAID",
            notes: `Pagamento registrado: ${input.paymentMethod}`,
          },
        });

        return { success: true };
      });
    }),

  // ── UPDATE COSTS (inline) ──
  updateCosts: tenantProcedure
    .input(updateCostsSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        await tx.serviceOrder.update({
          where: { id: input.id },
          data: {
            partsCost: centsToPrisma(input.partsCost),
            otherCost: centsToPrisma(input.otherCost),
          },
        });
        return { success: true };
      });
    }),

  // ── CONFIRM PHYSICAL SIGNATURE ──
  confirmPhysicalSignature: tenantProcedure
    .input(confirmPhysicalSignatureSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const order = await tx.serviceOrder.findUnique({ where: { id: input.orderId } });
        if (!order) throw new TRPCError({ code: "NOT_FOUND" });

         
        const data: any = {};
        let note = "";

        if (input.type === "entry") {
          data.physicalSignature = true;
          data.signatureSignedAt = new Date();
          note = "Assinatura fisica de entrada confirmada";
        } else if (input.type === "delivery") {
          data.deliveryTermSigned = true;
          data.deliveryTermPhysical = true;
          data.deliveryTermSignedAt = new Date();
          data.status = "DELIVERED";
          data.deliveredDate = new Date();
          note = "Assinatura fisica do termo de entrega confirmada — equipamento entregue";
        } else if (input.type === "return") {
          data.returnTermSigned = true;
          data.returnTermPhysical = true;
          data.returnTermSignedAt = new Date();
          data.status = "CANCELLED";
          data.cancellationReason = input.reason ?? "Equipamento devolvido ao cliente";
          note = "Assinatura fisica do termo de devolucao confirmada — OS cancelada";
        }

        await tx.serviceOrder.update({ where: { id: input.orderId }, data });

        await tx.serviceOrderHistory.create({
          data: {
            tenantId: ctx.tenantId,
            orderId: input.orderId,
            userId: ctx.session.user.id,
            previousStatus: order.status,
            newStatus: data.status ?? order.status,
            notes: note,
          },
        });

        return { success: true };
      });
    }),

  // ── SEND TO LAB ──
  sendToLab: tenantProcedure
    .input(sendToLabSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        await tx.serviceOrder.update({
          where: { id: input.orderId },
          data: {
            sentToLab: true,
            labReceived: false,
            deliveryPersonId: input.deliveryPersonId ?? null,
          },
        });

        await tx.serviceOrderHistory.create({
          data: {
            tenantId: ctx.tenantId,
            orderId: input.orderId,
            userId: ctx.session.user.id,
            previousStatus: null,
            newStatus: "IN_PROGRESS",
            notes: "Aparelho enviado ao laboratorio externo",
          },
        });

        return { success: true };
      });
    }),

  // ── RECEIVE FROM LAB ──
  receiveFromLab: tenantProcedure
    .input(receiveFromLabSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        await tx.serviceOrder.update({
          where: { id: input.orderId },
          data: { labReceived: true },
        });

        await tx.serviceOrderHistory.create({
          data: {
            tenantId: ctx.tenantId,
            orderId: input.orderId,
            userId: ctx.session.user.id,
            previousStatus: null,
            newStatus: "IN_PROGRESS",
            notes: "Aparelho retornou do laboratorio externo",
          },
        });

        return { success: true };
      });
    }),

  // ── CANCEL LAB ──
  cancelLab: tenantProcedure
    .input(cancelLabSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        await tx.serviceOrder.update({
          where: { id: input.orderId },
          data: { sentToLab: false, labReceived: false, deliveryPersonId: null },
        });
        return { success: true };
      });
    }),

  // ── CREATE QUOTE (orcamento adicional) ──
  createQuote: tenantProcedure
    .input(createQuoteSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const order = await tx.serviceOrder.findUnique({ where: { id: input.orderId } });
        if (!order || order.deletedAt) throw new TRPCError({ code: "NOT_FOUND" });

        if (order.budgetPending) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Ja existe orcamento pendente." });
        }

        if (["CANCELLED", "DELIVERED", "READY_FOR_PICKUP"].includes(order.status)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Nao e possivel criar orcamento para esta OS." });
        }

        const newPartsAmount = input.newPartsAmount ?? 0;
        const newDiscount = input.newDiscount ?? 0;
        const newTotal = input.newServiceAmount + newPartsAmount - newDiscount;

        const quote = await tx.serviceOrderQuote.create({
          data: {
            tenantId: ctx.tenantId,
            orderId: input.orderId,
            userId: ctx.session.user.id,
            previousServiceAmount: order.serviceAmount,
            previousPartsAmount: order.partsAmount,
            previousDiscount: order.discount,
            previousTotal: order.totalAmount,
            newServiceAmount: centsToPrisma(input.newServiceAmount),
            newPartsAmount: centsToPrisma(newPartsAmount),
            newDiscount: centsToPrisma(newDiscount),
            newTotal: centsToPrisma(newTotal),
            reason: input.reason,
            additionalServices: input.additionalServices ?? null,
            status: "pending",
            approvalLink: generateQuoteLink(),
          },
        });

        await tx.serviceOrder.update({
          where: { id: input.orderId },
          data: {
            pendingQuoteId: quote.id,
            budgetPending: true,
          },
        });

        await tx.serviceOrderHistory.create({
          data: {
            tenantId: ctx.tenantId,
            orderId: input.orderId,
            userId: ctx.session.user.id,
            previousStatus: order.status,
            newStatus: order.status,
            notes: `Orcamento criado. Motivo: ${input.reason}`,
          },
        });

        return { id: quote.id, approvalLink: quote.approvalLink };
      });
    }),

  // ── CANCEL QUOTE ──
  cancelQuote: tenantProcedure
    .input(z.object({ orderId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const order = await tx.serviceOrder.findUnique({ where: { id: input.orderId } });
        if (!order || !order.pendingQuoteId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum orcamento pendente." });
        }

        await tx.serviceOrderQuote.update({
          where: { id: order.pendingQuoteId },
          data: { status: "rejected", rejectedAt: new Date(), customerNotes: "Cancelado pela equipe" },
        });

        await tx.serviceOrder.update({
          where: { id: input.orderId },
          data: { pendingQuoteId: null, budgetPending: false },
        });

        return { success: true };
      });
    }),

  // ── APPROVE QUOTE MANUALLY (admin) ──
  approveQuoteManually: tenantProcedure
    .input(z.object({ orderId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const order = await tx.serviceOrder.findUnique({ where: { id: input.orderId } });
        if (!order || !order.pendingQuoteId) {
          throw new TRPCError({ code: "BAD_REQUEST" });
        }

        const quote = await tx.serviceOrderQuote.findUnique({ where: { id: order.pendingQuoteId } });
        if (!quote || quote.status !== "pending") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Orcamento nao encontrado ou ja processado." });
        }

        // Approve
        await tx.serviceOrderQuote.update({
          where: { id: quote.id },
          data: { status: "approved", approvedAt: new Date(), customerNotes: "Aprovado manualmente pelo administrador" },
        });

        // Update OS values
        await tx.serviceOrder.update({
          where: { id: input.orderId },
          data: {
            serviceAmount: quote.newServiceAmount,
            partsAmount: quote.newPartsAmount,
            discount: quote.newDiscount,
            totalAmount: quote.newTotal,
            pendingQuoteId: null,
            budgetPending: false,
          },
        });

        await tx.serviceOrderHistory.create({
          data: {
            tenantId: ctx.tenantId,
            orderId: input.orderId,
            userId: ctx.session.user.id,
            previousStatus: order.status,
            newStatus: order.status,
            notes: "Orcamento aprovado manualmente pelo administrador",
          },
        });

        return { success: true };
      });
    }),

  // ── PUBLIC: get by public link ──
  byPublicLink: publicProcedure
    .input(z.object({ link: z.string().min(1) }))
    .query(async ({ input }) => {
      // Public route - use withAdmin to bypass RLS
      return withAdmin(async (tx) => {
        const order = await tx.serviceOrder.findFirst({
          where: { publicLink: input.link, deletedAt: null },
          include: {
            items: true,
            history: { orderBy: { createdAt: "desc" }, take: 20 },
          },
        });

        if (!order) {
          throw new TRPCError({ code: "NOT_FOUND", message: "OS nao encontrada" });
        }

        // Load customer
        const customer = await tx.customer.findUnique({
          where: { id: order.customerId },
          select: { name: true, phone: true },
        });

        // Load tenant settings for branding
        const tenant = await tx.tenant.findUnique({
          where: { id: order.tenantId },
          select: { name: true },
        });

        return {
          number: order.number,
          status: order.status,
          deviceType: order.deviceType,
          deviceModel: order.deviceModel,
          reportedProblem: order.reportedProblem,
          diagnosedProblem: order.diagnosedProblem,
          totalAmount: decimalToCents(order.totalAmount),
          entryDate: order.entryDate,
          estimatedDate: order.estimatedDate,
          completedDate: order.completedDate,
          deliveredDate: order.deliveredDate,
          customerName: customer?.name ?? "—",
          tenantName: tenant?.name ?? "Arena Tech",
          items: order.items.map((i) => ({
            description: i.description,
            quantity: Number(i.quantity),
            total: decimalToCents(i.total),
          })),
          history: order.history.map((h) => ({
            newStatus: h.newStatus,
            notes: h.notes,
            createdAt: h.createdAt,
          })),
        };
      });
    }),

  // ── PUBLIC: get quote for approval ──
  getQuoteByLink: publicProcedure
    .input(z.object({ link: z.string().min(1) }))
    .query(async ({ input }) => {
      return withAdmin(async (tx) => {
        const quote = await tx.serviceOrderQuote.findFirst({
          where: { approvalLink: input.link },
          include: {
            order: {
              select: {
                number: true,
                customerId: true,
                deviceType: true,
                deviceModel: true,
                tenantId: true,
              },
            },
          },
        });

        if (!quote) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Orcamento nao encontrado" });
        }

        const customer = await tx.customer.findUnique({
          where: { id: quote.order.customerId },
          select: { name: true },
        });

        const tenant = await tx.tenant.findUnique({
          where: { id: quote.order.tenantId },
          select: { name: true },
        });

        return {
          ...serializeQuote(quote),
          orderNumber: quote.order.number,
          customerName: customer?.name ?? "—",
          tenantName: tenant?.name ?? "Arena Tech",
          deviceType: quote.order.deviceType,
          deviceModel: quote.order.deviceModel,
        };
      });
    }),

  // ── PUBLIC: respond to quote ──
  respondToQuote: publicProcedure
    .input(respondQuoteSchema)
    .mutation(async ({ input }) => {
      return withAdmin(async (tx) => {
        const quote = await tx.serviceOrderQuote.findFirst({
          where: { approvalLink: input.link },
        });

        if (!quote) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Orcamento nao encontrado" });
        }

        if (quote.status !== "pending") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Este orcamento ja foi processado." });
        }

        if (input.action === "approve") {
          await tx.serviceOrderQuote.update({
            where: { id: quote.id },
            data: {
              status: "approved",
              approvedAt: new Date(),
              customerNotes: input.customerNotes ?? null,
            },
          });

          // Update OS values
          await tx.serviceOrder.update({
            where: { id: quote.orderId },
            data: {
              serviceAmount: quote.newServiceAmount,
              partsAmount: quote.newPartsAmount,
              discount: quote.newDiscount,
              totalAmount: quote.newTotal,
              pendingQuoteId: null,
              budgetPending: false,
            },
          });

          await tx.serviceOrderHistory.create({
            data: {
              tenantId: quote.tenantId,
              orderId: quote.orderId,
              userId: quote.userId,
              previousStatus: null,
              newStatus: "APPROVED",
              notes: `Orcamento aprovado pelo cliente${input.customerNotes ? ". Obs: " + input.customerNotes : ""}`,
            },
          });
        } else {
          await tx.serviceOrderQuote.update({
            where: { id: quote.id },
            data: {
              status: "rejected",
              rejectedAt: new Date(),
              customerNotes: input.customerNotes ?? null,
            },
          });

          await tx.serviceOrder.update({
            where: { id: quote.orderId },
            data: { pendingQuoteId: null, budgetPending: false },
          });

          await tx.serviceOrderHistory.create({
            data: {
              tenantId: quote.tenantId,
              orderId: quote.orderId,
              userId: quote.userId,
              previousStatus: null,
              newStatus: "IN_DIAGNOSIS",
              notes: `Orcamento rejeitado pelo cliente${input.customerNotes ? ". Obs: " + input.customerNotes : ""}`,
            },
          });
        }

        return { success: true, action: input.action };
      });
    }),

  // ── SEND FOR DIGITAL SIGNATURE (Autentique) ──
  sendForSignature: tenantProcedure
    .input(z.object({ orderId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const order = await tx.serviceOrder.findUnique({
          where: { id: input.orderId },
        });
        if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "OS nao encontrada" });

        if (order.signatureDocumentId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Documento de assinatura ja foi enviado." });
        }

        const customer = await tx.customer.findUnique({
          where: { id: order.customerId },
          select: { name: true, phone: true },
        });
        if (!customer) throw new TRPCError({ code: "NOT_FOUND", message: "Cliente nao encontrado" });
        if (!customer.phone) throw new TRPCError({ code: "BAD_REQUEST", message: "Cliente sem telefone cadastrado" });

        // Generate a simple PDF buffer for the signature document
        const pdfUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/service-orders/${input.orderId}/pdf`;
        let pdfBuffer: Buffer;
        try {
          const res = await fetch(pdfUrl, { signal: AbortSignal.timeout(15_000) });
          if (!res.ok) throw new Error(`PDF generation failed: ${res.status}`);
          pdfBuffer = Buffer.from(await res.arrayBuffer());
        } catch (err) {
          logger.error("Failed to fetch OS PDF for signature", { orderId: input.orderId, error: err });
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Falha ao gerar PDF da OS para assinatura" });
        }

        const result = await createDocumentWithLink(
          `OS ${order.number} - Termo de Servico`,
          [{ name: customer.name, whatsapp: formatWhatsApp(customer.phone) }],
          pdfBuffer,
        );

        if (!result.success) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.error ?? "Erro ao enviar para Autentique" });
        }

        await tx.serviceOrder.update({
          where: { id: input.orderId },
          data: {
            signatureDocumentId: result.documentId ?? null,
            signatureUrl: result.signatureLink ?? null,
            signatureSentAt: new Date(),
          },
        });

        await tx.serviceOrderHistory.create({
          data: {
            tenantId: ctx.tenantId,
            orderId: input.orderId,
            userId: ctx.session.user.id,
            previousStatus: order.status,
            newStatus: order.status,
            notes: "Documento enviado para assinatura digital (Autentique)",
          },
        });

        logger.info("OS sent for digital signature", { orderId: input.orderId, documentId: result.documentId });

        return { success: true, signatureLink: result.signatureLink };
      });
    }),

  // ── CHECK SIGNATURE STATUS (Autentique) ──
  checkSignatureStatus: tenantProcedure
    .input(z.object({ orderId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const order = await tx.serviceOrder.findUnique({
          where: { id: input.orderId },
        });
        if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "OS nao encontrada" });
        if (!order.signatureDocumentId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum documento de assinatura enviado." });
        }

        const status = await getDocumentStatus(order.signatureDocumentId);

        if (!status.success) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: status.error ?? "Erro ao consultar Autentique" });
        }

        if (status.signed && !order.signatureSignedAt) {
          await tx.serviceOrder.update({
            where: { id: input.orderId },
            data: { signatureSignedAt: new Date() },
          });

          await tx.serviceOrderHistory.create({
            data: {
              tenantId: ctx.tenantId,
              orderId: input.orderId,
              userId: ctx.session.user.id,
              previousStatus: order.status,
              newStatus: order.status,
              notes: "Assinatura digital confirmada via Autentique",
            },
          });
        }

        return {
          signed: status.signed,
          signaturesCompleted: status.signaturesCompleted,
          totalSignatures: status.totalSignatures,
        };
      });
    }),

  // ── LIST TECHNICIANS ──
  listTechnicians: tenantProcedure.query(async ({ ctx }) => {
    // Technicians = users linked to this tenant
    const userTenants = await withAdmin(async (adminTx) => {
      return adminTx.userTenant.findMany({
        where: { tenantId: ctx.tenantId },
        select: {
          user: { select: { id: true, name: true } },
          role: true,
        },
      });
    });

    return userTenants.map((ut) => ({
      id: ut.user.id,
      name: ut.user.name,
      role: ut.role,
    }));
  }),

  // ── LIST VENDORS ──
  listVendors: tenantProcedure.query(async ({ ctx }) => {
    const userTenants = await withAdmin(async (adminTx) => {
      return adminTx.userTenant.findMany({
        where: { tenantId: ctx.tenantId },
        select: {
          user: { select: { id: true, name: true } },
          role: true,
        },
      });
    });

    return userTenants.map((ut) => ({
      id: ut.user.id,
      name: ut.user.name,
      role: ut.role,
    }));
  }),

  // ═══════════════════════════════════════
  // TECHNICIAN REPORT
  // ═══════════════════════════════════════

  technicianReport: tenantProcedure
    .input(technicianReportSchema)
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const where: Prisma.ServiceOrderWhereInput = {
          tenantId: ctx.tenantId,
        };

        if (input.dateFrom || input.dateTo) {
          where.createdAt = {};
          if (input.dateFrom) where.createdAt.gte = new Date(input.dateFrom);
          if (input.dateTo) where.createdAt.lte = new Date(input.dateTo + "T23:59:59");
        }
        if (input.technicianId) where.technicianId = input.technicianId;

        const orders = await tx.serviceOrder.findMany({
          where,
          select: {
            id: true,
            technicianId: true,
            status: true,
            serviceAmount: true,
            partsAmount: true,
            totalAmount: true,
            partsCost: true,
            otherCost: true,
            createdAt: true,
            completedDate: true,
          },
        });

        // Group by technician
        const byTech = new Map<string, {
          technicianId: string;
          totalOs: number;
          completed: number;
          cancelled: number;
          serviceValue: number;
          partsValue: number;
          totalValue: number;
          partsCost: number;
          otherCost: number;
          totalDays: number;
          completedCount: number;
        }>();

        for (const o of orders) {
          const techId = o.technicianId ?? "__unassigned__";
          let entry = byTech.get(techId);
          if (!entry) {
            entry = {
              technicianId: techId,
              totalOs: 0, completed: 0, cancelled: 0,
              serviceValue: 0, partsValue: 0, totalValue: 0,
              partsCost: 0, otherCost: 0,
              totalDays: 0, completedCount: 0,
            };
            byTech.set(techId, entry);
          }
          entry.totalOs++;
          if (o.status === "COMPLETED" || o.status === "DELIVERED") entry.completed++;
          if (o.status === "CANCELLED") entry.cancelled++;
          entry.serviceValue += Number(o.serviceAmount ?? 0);
          entry.partsValue += Number(o.partsAmount ?? 0);
          entry.totalValue += Number(o.totalAmount ?? 0);
          entry.partsCost += Number(o.partsCost ?? 0);
          entry.otherCost += Number(o.otherCost ?? 0);

          if (o.completedDate && o.createdAt) {
            const days = (o.completedDate.getTime() - o.createdAt.getTime()) / (1000 * 60 * 60 * 24);
            entry.totalDays += days;
            entry.completedCount++;
          }
        }

        // Get technician names
        const techIds = [...byTech.keys()].filter((id) => id !== "__unassigned__");
        const users = await withAdmin(async (adminTx) => {
          return adminTx.user.findMany({
            where: { id: { in: techIds } },
            select: { id: true, name: true },
          });
        });
        const nameMap = new Map(users.map((u) => [u.id, u.name]));

        const items = [...byTech.values()]
          .map((e) => {
            const profit = e.totalValue - e.partsCost - e.otherCost;
            const ticketMedio = e.completed > 0 ? e.totalValue / e.completed : 0;
            const avgDays = e.completedCount > 0 ? Math.round(e.totalDays / e.completedCount) : null;
            return {
              technicianId: e.technicianId,
              technicianName: nameMap.get(e.technicianId) ?? "Nao identificado",
              totalOs: e.totalOs,
              completed: e.completed,
              cancelled: e.cancelled,
              serviceValue: Math.round(e.serviceValue * 100),
              partsValue: Math.round(e.partsValue * 100),
              totalValue: Math.round(e.totalValue * 100),
              partsCost: Math.round(e.partsCost * 100),
              otherCost: Math.round(e.otherCost * 100),
              profit: Math.round(profit * 100),
              ticketMedio: Math.round(ticketMedio * 100),
              avgDays,
            };
          })
          .sort((a, b) => b.totalValue - a.totalValue);

        const totals = items.reduce(
          (acc, i) => {
            acc.totalOs += i.totalOs;
            acc.completed += i.completed;
            acc.cancelled += i.cancelled;
            acc.serviceValue += i.serviceValue;
            acc.partsValue += i.partsValue;
            acc.totalValue += i.totalValue;
            acc.partsCost += i.partsCost;
            acc.otherCost += i.otherCost;
            acc.profit += i.profit;
            return acc;
          },
          { totalOs: 0, completed: 0, cancelled: 0, serviceValue: 0, partsValue: 0, totalValue: 0, partsCost: 0, otherCost: 0, profit: 0 }
        );
        const ticketMedio = totals.completed > 0 ? Math.round(totals.totalValue / totals.completed) : 0;

        return { items, totals: { ...totals, ticketMedio } };
      });
    }),
});

// ── Helper: Recalculate order totals from items ──

 
async function recalculateOrderTotals(tx: any, orderId: string, _tenantId: string) {
  const items = await tx.serviceOrderItem.findMany({
    where: { orderId },
  });

  let serviceAmount = 0;
  let partsAmount = 0;

  for (const item of items) {
    const total = Number(item.total);
    if (item.type === "SERVICE") serviceAmount += total;
    else partsAmount += total;
  }

  const order = await tx.serviceOrder.findUnique({
    where: { id: orderId },
    select: { discount: true },
  });

  const discount = Number(order?.discount ?? 0);
  const totalAmount = serviceAmount + partsAmount - discount;

  await tx.serviceOrder.update({
    where: { id: orderId },
    data: {
      serviceAmount: new Prisma.Decimal(serviceAmount),
      partsAmount: new Prisma.Decimal(partsAmount),
      totalAmount: new Prisma.Decimal(Math.max(0, totalAmount)),
    },
  });
}
