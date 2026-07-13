import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Prisma } from "@prisma/client";
import { createTRPCRouter, tenantProcedure } from "@/server/api/trpc";
import {
  createDeliveryPersonSchema,
  updateDeliveryPersonSchema,
  createExternalLabSchema,
  updateExternalLabSchema,
  createLabOrderSchema,
  updateLabOrderStatusSchema,
  createServiceProviderSchema,
  updateServiceProviderSchema,
  listDeliveryPersonsSchema,
  listExternalLabsSchema,
  listLabOrdersSchema,
  listServiceProvidersSchema,
} from "@/lib/validators/operation";

// ── Helpers ──

function decimalToCents(v: Prisma.Decimal | null | undefined): number {
  if (v == null) return 0;
  return Math.round(Number(v) * 100);
}

function centsToPrisma(cents: number): Prisma.Decimal {
  return new Prisma.Decimal(cents / 100);
}

export const operationRouter = createTRPCRouter({
  // ═══════════════════════════════════════
  // DELIVERY PERSONS
  // ═══════════════════════════════════════

  listDeliveryPersons: tenantProcedure
    .input(listDeliveryPersonsSchema)
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const where: Prisma.DeliveryPersonWhereInput = { deletedAt: null };
        if (input.active !== undefined) where.active = input.active;
        if (input.search) {
          where.name = { contains: input.search, mode: "insensitive" };
        }
        return tx.deliveryPerson.findMany({ where, orderBy: { name: "asc" } });
      });
    }),

  createDeliveryPerson: tenantProcedure
    .input(createDeliveryPersonSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const person = await tx.deliveryPerson.create({
          data: {
            tenantId: ctx.tenantId,
            name: input.name,
            phone: input.phone ?? null,
            email: input.email ?? null,
            notes: input.notes ?? null,
          },
        });
        return { id: person.id };
      });
    }),

  updateDeliveryPerson: tenantProcedure
    .input(updateDeliveryPersonSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const existing = await tx.deliveryPerson.findFirst({
          where: { id: input.id, deletedAt: null },
        });
        if (!existing) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Entregador nao encontrado" });
        }
        await tx.deliveryPerson.update({
          where: { id: input.id },
          data: {
            name: input.name,
            phone: input.phone ?? null,
            email: input.email ?? null,
            active: input.active,
            notes: input.notes ?? null,
          },
        });
        return { success: true };
      });
    }),

  deleteDeliveryPerson: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        await tx.deliveryPerson.update({
          where: { id: input.id },
          data: { deletedAt: new Date() },
        });
        return { success: true };
      });
    }),

  // ═══════════════════════════════════════
  // EXTERNAL LABS
  // ═══════════════════════════════════════

  listExternalLabs: tenantProcedure
    .input(listExternalLabsSchema)
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const where: Prisma.ExternalLabWhereInput = { deletedAt: null };
        if (input.active !== undefined) where.active = input.active;
        if (input.search) {
          where.name = { contains: input.search, mode: "insensitive" };
        }
        return tx.externalLab.findMany({ where, orderBy: { name: "asc" } });
      });
    }),

  createExternalLab: tenantProcedure
    .input(createExternalLabSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const lab = await tx.externalLab.create({
          data: {
            tenantId: ctx.tenantId,
            name: input.name,
            contact: input.contact ?? null,
            phone: input.phone ?? null,
            email: input.email ?? null,
            address: input.address ?? Prisma.DbNull,
            notes: input.notes ?? null,
          },
        });
        return { id: lab.id };
      });
    }),

  updateExternalLab: tenantProcedure
    .input(updateExternalLabSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const existing = await tx.externalLab.findFirst({
          where: { id: input.id, deletedAt: null },
        });
        if (!existing) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Laboratorio nao encontrado" });
        }
        await tx.externalLab.update({
          where: { id: input.id },
          data: {
            name: input.name,
            contact: input.contact ?? null,
            phone: input.phone ?? null,
            email: input.email ?? null,
            address: input.address ?? Prisma.DbNull,
            active: input.active,
            notes: input.notes ?? null,
          },
        });
        return { success: true };
      });
    }),

  deleteExternalLab: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        await tx.externalLab.update({
          where: { id: input.id },
          data: { deletedAt: new Date() },
        });
        return { success: true };
      });
    }),

  // ═══════════════════════════════════════
  // LAB ORDERS
  // ═══════════════════════════════════════

  listLabOrders: tenantProcedure
    .input(listLabOrdersSchema)
    .query(async ({ ctx, input }) => {
      const page = input.page ?? 0;
      const pageSize = input.pageSize ?? 20;

      return ctx.withTenant(async (tx) => {
        const where: Prisma.LabOrderWhereInput = {};
        if (input.status) where.status = input.status;
        if (input.labId) where.labId = input.labId;

        const [data, total] = await Promise.all([
          tx.labOrder.findMany({
            where,
            include: { lab: { select: { name: true } } },
            orderBy: { createdAt: "desc" },
            skip: page * pageSize,
            take: pageSize,
          }),
          tx.labOrder.count({ where }),
        ]);

        return {
          data: data.map((lo) => ({
            ...lo,
            estimatedCost: lo.estimatedCost ? decimalToCents(lo.estimatedCost) : null,
            finalCost: lo.finalCost ? decimalToCents(lo.finalCost) : null,
            labName: lo.lab.name,
          })),
          total,
          pageCount: Math.ceil(total / pageSize),
        };
      });
    }),

  createLabOrder: tenantProcedure
    .input(createLabOrderSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const lab = await tx.externalLab.findUnique({ where: { id: input.labId } });
        if (!lab) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Laboratorio nao encontrado" });
        }

        const order = await tx.labOrder.create({
          data: {
            tenantId: ctx.tenantId,
            labId: input.labId,
            serviceOrderId: input.serviceOrderId ?? null,
            deliveryPersonId: input.deliveryPersonId ?? null,
            deviceDescription: input.deviceDescription ?? null,
            problem: input.problem ?? null,
            estimatedCost: input.estimatedCost != null ? centsToPrisma(input.estimatedCost) : null,
            notes: input.notes ?? null,
            status: "SENT",
            sentAt: new Date(),
          },
        });
        return { id: order.id };
      });
    }),

  updateLabOrderStatus: tenantProcedure
    .input(updateLabOrderStatusSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const order = await tx.labOrder.findUnique({
          where: { id: input.id },
          include: { lab: { select: { name: true } } },
        });
        if (!order) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Envio nao encontrado" });
        }

        const data: Record<string, unknown> = {
          status: input.status,
          notes: input.notes ?? order.notes,
        };

        // Set timestamps based on status
        if (input.status === "RECEIVED") data.receivedAt = new Date();
        if (input.status === "COMPLETED") data.completedAt = new Date();
        if (input.status === "RETURNED") data.returnedAt = new Date();
        if (input.finalCost != null) data.finalCost = centsToPrisma(input.finalCost);

        // Gerar PAYABLE quando lab devolve com finalCost > 0 e ainda não há PAYABLE
        const shouldGeneratePayable =
          (input.status === "RETURNED" || input.status === "COMPLETED") &&
          input.finalCost != null &&
          input.finalCost > 0 &&
          !order.payableTransactionId;

        if (shouldGeneratePayable) {
          const labName = order.lab?.name ?? "Laboratório externo";
          const description = `Servico lab ${labName}${order.serviceOrderId ? ` — OS ${order.serviceOrderId.slice(0, 8)}` : ""}`;
          const ft = await tx.financialTransaction.create({
            data: {
              tenantId: ctx.tenantId,
              type: "PAYABLE",
              status: "PENDING",
              description,
              supplier: labName,
              totalAmount: centsToPrisma(input.finalCost!),
              paidAmount: 0,
              installmentsTotal: 1,
              dueDate: new Date(),
              emissionDate: new Date(),
              referenceType: "lab_order",
              referenceId: order.id,
              createdByUserId: ctx.session.user.id,
            },
          });
          await tx.installment.create({
            data: {
              tenantId: ctx.tenantId,
              transactionId: ft.id,
              number: 1,
              amount: centsToPrisma(input.finalCost!),
              dueDate: new Date(),
              status: "PENDING",
            },
          });
          data.payableTransactionId = ft.id;
        }

        await tx.labOrder.update({ where: { id: input.id }, data });

        // Quando lab termina, marcar a OS relacionada (se houver) com labReceived=true
        if (input.status === "RETURNED" && order.serviceOrderId) {
          await tx.serviceOrder.updateMany({
            where: { id: order.serviceOrderId },
            data: { labReceived: true },
          });
        }

        return { success: true, payableGenerated: shouldGeneratePayable };
      });
    }),

  // ═══════════════════════════════════════
  // SERVICE PROVIDERS
  // ═══════════════════════════════════════

  listServiceProviders: tenantProcedure
    .input(listServiceProvidersSchema)
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const where: Prisma.ServiceProviderWhereInput = { deletedAt: null };
        if (input.active !== undefined) where.active = input.active;
        if (input.type) where.type = input.type;
        if (input.search) {
          where.name = { contains: input.search, mode: "insensitive" };
        }

        const providers = await tx.serviceProvider.findMany({
          where,
          orderBy: { name: "asc" },
        });

        return providers.map((p) => ({
          ...p,
          commissionRate: p.commissionRate ? Number(p.commissionRate) : null,
        }));
      });
    }),

  createServiceProvider: tenantProcedure
    .input(createServiceProviderSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const provider = await tx.serviceProvider.create({
          data: {
            tenantId: ctx.tenantId,
            name: input.name,
            type: input.type,
            cpfCnpj: input.cpfCnpj ?? null,
            phone: input.phone ?? null,
            email: input.email ?? null,
            commissionRate: input.commissionRate != null ? new Prisma.Decimal(input.commissionRate) : null,
            contractDetails: (input.contractDetails as Prisma.InputJsonValue) ?? Prisma.DbNull,
            isTechnician: input.isTechnician ?? false,
            notes: input.notes ?? null,
          },
        });
        return { id: provider.id };
      });
    }),

  updateServiceProvider: tenantProcedure
    .input(updateServiceProviderSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const existing = await tx.serviceProvider.findFirst({
          where: { id: input.id, deletedAt: null },
        });
        if (!existing) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Prestador nao encontrado" });
        }
        await tx.serviceProvider.update({
          where: { id: input.id },
          data: {
            name: input.name,
            type: input.type,
            cpfCnpj: input.cpfCnpj ?? null,
            phone: input.phone ?? null,
            email: input.email ?? null,
            commissionRate: input.commissionRate != null ? new Prisma.Decimal(input.commissionRate) : null,
            contractDetails: (input.contractDetails as Prisma.InputJsonValue) ?? Prisma.DbNull,
            active: input.active,
            isTechnician: input.isTechnician ?? false,
            notes: input.notes ?? null,
          },
        });
        return { success: true };
      });
    }),

  deleteServiceProvider: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        await tx.serviceProvider.update({
          where: { id: input.id },
          data: { deletedAt: new Date() },
        });
        return { success: true };
      });
    }),
});
