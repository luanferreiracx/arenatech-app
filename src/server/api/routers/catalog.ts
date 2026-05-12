import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, tenantProcedure } from "@/server/api/trpc";
import {
  createServiceSchema,
  updateServiceSchema,
  listServicesSchema,
  createDiagnosticTemplateSchema,
  updateDiagnosticTemplateSchema,
  listDiagnosticTemplatesSchema,
  createDeviceCategorySchema,
  updateDeviceCategorySchema,
  createDeviceSchema,
  updateDeviceSchema,
  listDevicesSchema,
} from "@/lib/validators/catalog";
import { Prisma } from "@prisma/client";

export const catalogRouter = createTRPCRouter({
  // ═══════════════════════════════════════
  // SERVICES
  // ═══════════════════════════════════════

  listServices: tenantProcedure
    .input(listServicesSchema)
    .query(async ({ ctx, input }) => {
      const page = input.page ?? 0;
      const pageSize = input.pageSize ?? 10;

      return ctx.withTenant(async (tx) => {
        const where: Prisma.ServiceWhereInput = { deletedAt: null };

        if (input.active !== undefined) {
          where.active = input.active;
        }

        if (input.search?.trim()) {
          const term = input.search.trim();
          where.OR = [
            { name: { contains: term, mode: "insensitive" } },
            { description: { contains: term, mode: "insensitive" } },
          ];
        }

        const [data, total] = await Promise.all([
          tx.service.findMany({
            where,
            orderBy: { name: "asc" },
            skip: page * pageSize,
            take: pageSize,
          }),
          tx.service.count({ where }),
        ]);

        return {
          data,
          total,
          pageCount: Math.ceil(total / pageSize),
        };
      });
    }),

  getService: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const service = await tx.service.findUnique({
          where: { id: input.id },
        });
        if (!service || service.deletedAt) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Servico nao encontrado" });
        }
        return service;
      });
    }),

  createService: tenantProcedure
    .input(createServiceSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        return tx.service.create({
          data: {
            tenantId: ctx.tenantId,
            name: input.name,
            description: input.description || null,
            basePrice: new Prisma.Decimal(input.basePrice).div(100),
            estimatedTime: input.estimatedTime || null,
          },
        });
      });
    }),

  updateService: tenantProcedure
    .input(updateServiceSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const existing = await tx.service.findUnique({ where: { id: input.id } });
        if (!existing || existing.deletedAt) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Servico nao encontrado" });
        }

        return tx.service.update({
          where: { id: input.id },
          data: {
            name: input.name,
            description: input.description || null,
            basePrice: new Prisma.Decimal(input.basePrice).div(100),
            estimatedTime: input.estimatedTime || null,
          },
        });
      });
    }),

  deleteService: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const existing = await tx.service.findUnique({ where: { id: input.id } });
        if (!existing) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Servico nao encontrado" });
        }

        await tx.service.update({
          where: { id: input.id },
          data: { deletedAt: new Date() },
        });
        return { success: true };
      });
    }),

  toggleServiceActive: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const existing = await tx.service.findUnique({ where: { id: input.id } });
        if (!existing || existing.deletedAt) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Servico nao encontrado" });
        }

        return tx.service.update({
          where: { id: input.id },
          data: { active: !existing.active },
        });
      });
    }),

  // ═══════════════════════════════════════
  // DIAGNOSTIC TEMPLATES
  // ═══════════════════════════════════════

  listDiagnosticTemplates: tenantProcedure
    .input(listDiagnosticTemplatesSchema)
    .query(async ({ ctx, input }) => {
      const page = input.page ?? 0;
      const pageSize = input.pageSize ?? 10;

      return ctx.withTenant(async (tx) => {
        const where: Prisma.DiagnosticTemplateWhereInput = { deletedAt: null };

        if (input.active !== undefined) {
          where.active = input.active;
        }

        if (input.category) {
          where.category = input.category;
        }

        if (input.search?.trim()) {
          const term = input.search.trim();
          where.OR = [
            { title: { contains: term, mode: "insensitive" } },
            { content: { contains: term, mode: "insensitive" } },
            { category: { contains: term, mode: "insensitive" } },
          ];
        }

        const [data, total] = await Promise.all([
          tx.diagnosticTemplate.findMany({
            where,
            orderBy: [{ category: "asc" }, { title: "asc" }],
            skip: page * pageSize,
            take: pageSize,
          }),
          tx.diagnosticTemplate.count({ where }),
        ]);

        return {
          data,
          total,
          pageCount: Math.ceil(total / pageSize),
        };
      });
    }),

  getDiagnosticTemplate: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const template = await tx.diagnosticTemplate.findUnique({
          where: { id: input.id },
        });
        if (!template || template.deletedAt) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Template nao encontrado" });
        }
        return template;
      });
    }),

  createDiagnosticTemplate: tenantProcedure
    .input(createDiagnosticTemplateSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        return tx.diagnosticTemplate.create({
          data: {
            tenantId: ctx.tenantId,
            title: input.title,
            content: input.content,
            category: input.category || null,
          },
        });
      });
    }),

  updateDiagnosticTemplate: tenantProcedure
    .input(updateDiagnosticTemplateSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const existing = await tx.diagnosticTemplate.findUnique({ where: { id: input.id } });
        if (!existing || existing.deletedAt) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Template nao encontrado" });
        }

        return tx.diagnosticTemplate.update({
          where: { id: input.id },
          data: {
            title: input.title,
            content: input.content,
            category: input.category || null,
          },
        });
      });
    }),

  deleteDiagnosticTemplate: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const existing = await tx.diagnosticTemplate.findUnique({ where: { id: input.id } });
        if (!existing) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Template nao encontrado" });
        }

        await tx.diagnosticTemplate.update({
          where: { id: input.id },
          data: { deletedAt: new Date() },
        });
        return { success: true };
      });
    }),

  // ═══════════════════════════════════════
  // DEVICE CATEGORIES
  // ═══════════════════════════════════════

  listDeviceCategories: tenantProcedure.query(async ({ ctx }) => {
    return ctx.withTenant(async (tx) => {
      return tx.deviceCategory.findMany({
        orderBy: { name: "asc" },
        include: { _count: { select: { devices: true } } },
      });
    });
  }),

  createDeviceCategory: tenantProcedure
    .input(createDeviceCategorySchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const existing = await tx.deviceCategory.findFirst({
          where: { name: { equals: input.name, mode: "insensitive" } },
        });
        if (existing) {
          throw new TRPCError({ code: "CONFLICT", message: "Categoria ja existe" });
        }

        return tx.deviceCategory.create({
          data: {
            tenantId: ctx.tenantId,
            name: input.name,
          },
        });
      });
    }),

  updateDeviceCategory: tenantProcedure
    .input(updateDeviceCategorySchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const existing = await tx.deviceCategory.findUnique({ where: { id: input.id } });
        if (!existing) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Categoria nao encontrada" });
        }

        // Check name uniqueness (exclude self)
        const dup = await tx.deviceCategory.findFirst({
          where: {
            name: { equals: input.name, mode: "insensitive" },
            id: { not: input.id },
          },
        });
        if (dup) {
          throw new TRPCError({ code: "CONFLICT", message: "Categoria ja existe" });
        }

        return tx.deviceCategory.update({
          where: { id: input.id },
          data: { name: input.name },
        });
      });
    }),

  deleteDeviceCategory: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const existing = await tx.deviceCategory.findUnique({
          where: { id: input.id },
          include: { _count: { select: { devices: true } } },
        });
        if (!existing) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Categoria nao encontrada" });
        }
        if (existing._count.devices > 0) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: `Categoria possui ${existing._count.devices} aparelho(s) vinculado(s). Remova-os antes de excluir.`,
          });
        }

        await tx.deviceCategory.delete({ where: { id: input.id } });
        return { success: true };
      });
    }),

  // ═══════════════════════════════════════
  // DEVICES
  // ═══════════════════════════════════════

  listDevices: tenantProcedure
    .input(listDevicesSchema)
    .query(async ({ ctx, input }) => {
      const page = input.page ?? 0;
      const pageSize = input.pageSize ?? 10;

      return ctx.withTenant(async (tx) => {
        const where: Prisma.DeviceWhereInput = { deletedAt: null };

        if (input.active !== undefined) {
          where.active = input.active;
        }

        if (input.categoryId) {
          where.categoryId = input.categoryId;
        }

        if (input.search?.trim()) {
          const term = input.search.trim();
          where.OR = [
            { brand: { contains: term, mode: "insensitive" } },
            { model: { contains: term, mode: "insensitive" } },
          ];
        }

        const [data, total] = await Promise.all([
          tx.device.findMany({
            where,
            orderBy: [{ brand: "asc" }, { model: "asc" }],
            skip: page * pageSize,
            take: pageSize,
            include: { category: true },
          }),
          tx.device.count({ where }),
        ]);

        return {
          data,
          total,
          pageCount: Math.ceil(total / pageSize),
        };
      });
    }),

  getDevice: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const device = await tx.device.findUnique({
          where: { id: input.id },
          include: { category: true },
        });
        if (!device || device.deletedAt) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Aparelho nao encontrado" });
        }
        return device;
      });
    }),

  createDevice: tenantProcedure
    .input(createDeviceSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        return tx.device.create({
          data: {
            tenantId: ctx.tenantId,
            categoryId: input.categoryId || null,
            brand: input.brand,
            model: input.model,
            attributes: input.attributes ?? undefined,
          },
        });
      });
    }),

  updateDevice: tenantProcedure
    .input(updateDeviceSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const existing = await tx.device.findUnique({ where: { id: input.id } });
        if (!existing || existing.deletedAt) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Aparelho nao encontrado" });
        }

        return tx.device.update({
          where: { id: input.id },
          data: {
            categoryId: input.categoryId || null,
            brand: input.brand,
            model: input.model,
            attributes: input.attributes ?? undefined,
          },
        });
      });
    }),

  deleteDevice: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const existing = await tx.device.findUnique({ where: { id: input.id } });
        if (!existing) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Aparelho nao encontrado" });
        }

        await tx.device.update({
          where: { id: input.id },
          data: { deletedAt: new Date() },
        });
        return { success: true };
      });
    }),
});
