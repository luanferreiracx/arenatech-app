import { z } from "zod";
import { TRPCError } from "@trpc/server";
import type { Prisma } from "@prisma/client";
import { createTRPCRouter, tenantProcedure } from "@/server/api/trpc";
import {
  createDeliveryPersonSchema,
  updateDeliveryPersonSchema,
  listDeliveryPersonsSchema,
  createExternalLabSchema,
  updateExternalLabSchema,
  listExternalLabsSchema,
  createLabOrderSchema,
  updateLabOrderStatusSchema,
  listLabOrdersSchema,
  createServiceProviderSchema,
  updateServiceProviderSchema,
  listServiceProvidersSchema,
} from "@/lib/validators/operation";

export const operationRouter = createTRPCRouter({
  // ── Delivery Persons ──────────────────────────────────────────────────────

  listDeliveryPersons: tenantProcedure
    .input(listDeliveryPersonsSchema)
    .query(async ({ ctx, input }) => {
      const { search, active, page, pageSize } = input;
      const skip = page * pageSize;

      return ctx.withTenant(async (tx) => {
        const where = {
          deletedAt: null,
          ...(active !== undefined ? { active } : {}),
          ...(search
            ? {
                OR: [
                  { name: { contains: search, mode: "insensitive" as const } },
                  { phone: { contains: search } },
                  { email: { contains: search, mode: "insensitive" as const } },
                ],
              }
            : {}),
        };

        const [items, total] = await Promise.all([
          tx.deliveryPerson.findMany({
            where,
            skip,
            take: pageSize,
            orderBy: { name: "asc" },
          }),
          tx.deliveryPerson.count({ where }),
        ]);

        return { items, total, pageCount: Math.ceil(total / pageSize) };
      });
    }),

  createDeliveryPerson: tenantProcedure
    .input(createDeliveryPersonSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        return tx.deliveryPerson.create({
          data: { tenantId: ctx.tenantId, ...input },
        });
      });
    }),

  updateDeliveryPerson: tenantProcedure
    .input(updateDeliveryPersonSchema.extend({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.withTenant(async (tx) => {
        const existing = await tx.deliveryPerson.findFirst({ where: { id, deletedAt: null } });
        if (!existing) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Entregador não encontrado" });
        }
        return tx.deliveryPerson.update({ where: { id }, data });
      });
    }),

  deleteDeliveryPerson: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const existing = await tx.deliveryPerson.findFirst({ where: { id: input.id, deletedAt: null } });
        if (!existing) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Entregador não encontrado" });
        }
        return tx.deliveryPerson.update({
          where: { id: input.id },
          data: { deletedAt: new Date() },
        });
      });
    }),

  // ── External Labs ─────────────────────────────────────────────────────────

  listExternalLabs: tenantProcedure
    .input(listExternalLabsSchema)
    .query(async ({ ctx, input }) => {
      const { search, active, page, pageSize } = input;
      const skip = page * pageSize;

      return ctx.withTenant(async (tx) => {
        const where = {
          deletedAt: null,
          ...(active !== undefined ? { active } : {}),
          ...(search
            ? {
                OR: [
                  { name: { contains: search, mode: "insensitive" as const } },
                  { contact: { contains: search, mode: "insensitive" as const } },
                  { phone: { contains: search } },
                ],
              }
            : {}),
        };

        const [items, total] = await Promise.all([
          tx.externalLab.findMany({
            where,
            skip,
            take: pageSize,
            orderBy: { name: "asc" },
          }),
          tx.externalLab.count({ where }),
        ]);

        return { items, total, pageCount: Math.ceil(total / pageSize) };
      });
    }),

  createExternalLab: tenantProcedure
    .input(createExternalLabSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        return tx.externalLab.create({
          data: {
            tenantId: ctx.tenantId,
            ...input,
            address: input.address as Prisma.InputJsonValue | undefined,
          },
        });
      });
    }),

  updateExternalLab: tenantProcedure
    .input(updateExternalLabSchema.extend({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.withTenant(async (tx) => {
        const existing = await tx.externalLab.findFirst({ where: { id, deletedAt: null } });
        if (!existing) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Laboratório não encontrado" });
        }
        return tx.externalLab.update({
          where: { id },
          data: {
            ...data,
            address: data.address as Prisma.InputJsonValue | undefined,
          },
        });
      });
    }),

  deleteExternalLab: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const existing = await tx.externalLab.findFirst({ where: { id: input.id, deletedAt: null } });
        if (!existing) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Laboratório não encontrado" });
        }
        return tx.externalLab.update({
          where: { id: input.id },
          data: { deletedAt: new Date() },
        });
      });
    }),

  // ── Lab Orders ────────────────────────────────────────────────────────────

  listLabOrders: tenantProcedure
    .input(listLabOrdersSchema)
    .query(async ({ ctx, input }) => {
      const { status, labId, dateFrom, dateTo, page, pageSize } = input;
      const skip = page * pageSize;

      return ctx.withTenant(async (tx) => {
        const where = {
          ...(status ? { status } : {}),
          ...(labId ? { labId } : {}),
          ...(dateFrom || dateTo
            ? {
                sentAt: {
                  ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
                  ...(dateTo ? { lte: new Date(dateTo) } : {}),
                },
              }
            : {}),
        };

        const [items, total] = await Promise.all([
          tx.labOrder.findMany({
            where,
            skip,
            take: pageSize,
            orderBy: { sentAt: "desc" },
            include: { lab: { select: { id: true, name: true } } },
          }),
          tx.labOrder.count({ where }),
        ]);

        return { items, total, pageCount: Math.ceil(total / pageSize) };
      });
    }),

  getLabOrder: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const order = await tx.labOrder.findFirst({
          where: { id: input.id },
          include: { lab: { select: { id: true, name: true } } },
        });
        if (!order) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Envio não encontrado" });
        }
        return order;
      });
    }),

  createLabOrder: tenantProcedure
    .input(createLabOrderSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        // Validate lab exists
        const lab = await tx.externalLab.findFirst({ where: { id: input.labId, deletedAt: null } });
        if (!lab) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Laboratório não encontrado" });
        }

        return tx.labOrder.create({
          data: {
            tenantId: ctx.tenantId,
            ...input,
            status: "SENT",
            sentAt: new Date(),
          },
        });
      });
    }),

  updateLabOrderStatus: tenantProcedure
    .input(updateLabOrderStatusSchema)
    .mutation(async ({ ctx, input }) => {
      const { id, status, finalCost, notes } = input;

      return ctx.withTenant(async (tx) => {
        const existing = await tx.labOrder.findFirst({ where: { id } });
        if (!existing) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Envio não encontrado" });
        }

        // Auto-set timestamp fields based on status transition
        const dateFields: Record<string, Date> = {};
        if (status === "RECEIVED") dateFields.receivedAt = new Date();
        if (status === "COMPLETED") dateFields.completedAt = new Date();
        if (status === "RETURNED") dateFields.returnedAt = new Date();

        return tx.labOrder.update({
          where: { id },
          data: {
            status,
            ...(finalCost !== undefined ? { finalCost } : {}),
            ...(notes !== undefined ? { notes } : {}),
            ...dateFields,
          },
        });
      });
    }),

  // ── Service Providers ─────────────────────────────────────────────────────

  listServiceProviders: tenantProcedure
    .input(listServiceProvidersSchema)
    .query(async ({ ctx, input }) => {
      const { search, type, active, page, pageSize } = input;
      const skip = page * pageSize;

      return ctx.withTenant(async (tx) => {
        const where = {
          deletedAt: null,
          ...(type ? { type } : {}),
          ...(active !== undefined ? { active } : {}),
          ...(search
            ? {
                OR: [
                  { name: { contains: search, mode: "insensitive" as const } },
                  { cpfCnpj: { contains: search } },
                  { phone: { contains: search } },
                ],
              }
            : {}),
        };

        const [items, total] = await Promise.all([
          tx.serviceProvider.findMany({
            where,
            skip,
            take: pageSize,
            orderBy: { name: "asc" },
          }),
          tx.serviceProvider.count({ where }),
        ]);

        return { items, total, pageCount: Math.ceil(total / pageSize) };
      });
    }),

  createServiceProvider: tenantProcedure
    .input(createServiceProviderSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        return tx.serviceProvider.create({
          data: {
            tenantId: ctx.tenantId,
            ...input,
            contractDetails: input.contractDetails as Prisma.InputJsonValue | undefined,
          },
        });
      });
    }),

  updateServiceProvider: tenantProcedure
    .input(updateServiceProviderSchema.extend({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.withTenant(async (tx) => {
        const existing = await tx.serviceProvider.findFirst({ where: { id, deletedAt: null } });
        if (!existing) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Prestador não encontrado" });
        }
        return tx.serviceProvider.update({
          where: { id },
          data: {
            ...data,
            contractDetails: data.contractDetails as Prisma.InputJsonValue | undefined,
          },
        });
      });
    }),

  deleteServiceProvider: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const existing = await tx.serviceProvider.findFirst({ where: { id: input.id, deletedAt: null } });
        if (!existing) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Prestador não encontrado" });
        }
        return tx.serviceProvider.update({
          where: { id: input.id },
          data: { deletedAt: new Date() },
        });
      });
    }),
});
