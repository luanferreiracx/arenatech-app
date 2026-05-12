import { z } from "zod";
import { createTRPCRouter, tenantProcedure } from "@/server/api/trpc";
import {
  createServiceSchema,
  updateServiceSchema,
  createDiagnosticTemplateSchema,
  updateDiagnosticTemplateSchema,
  createDeviceCategorySchema,
  createDeviceSchema,
  updateDeviceSchema,
  listPaginationSchema,
} from "@/lib/validators/catalog";

export const catalogRouter = createTRPCRouter({
  // ── Services ─────────────────────────────────────────────────────────────

  listServices: tenantProcedure
    .input(listPaginationSchema)
    .query(async ({ ctx, input }) => {
      const { search, page, pageSize } = input;
      const skip = page * pageSize;

      return ctx.withTenant(async (tx) => {
        const where = {
          deletedAt: null,
          ...(search
            ? {
                OR: [
                  { name: { contains: search, mode: "insensitive" as const } },
                  { description: { contains: search, mode: "insensitive" as const } },
                ],
              }
            : {}),
        };

        const [items, total] = await Promise.all([
          tx.service.findMany({
            where,
            skip,
            take: pageSize,
            orderBy: { name: "asc" },
          }),
          tx.service.count({ where }),
        ]);

        return { items, total, pageCount: Math.ceil(total / pageSize) };
      });
    }),

  getService: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        return tx.service.findFirst({ where: { id: input.id, deletedAt: null } });
      });
    }),

  createService: tenantProcedure
    .input(createServiceSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        return tx.service.create({
          data: { tenantId: ctx.tenantId, ...input },
        });
      });
    }),

  updateService: tenantProcedure
    .input(updateServiceSchema.extend({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.withTenant(async (tx) => {
        return tx.service.update({ where: { id }, data });
      });
    }),

  deleteService: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        return tx.service.update({
          where: { id: input.id },
          data: { deletedAt: new Date() },
        });
      });
    }),

  // ── DiagnosticTemplates ───────────────────────────────────────────────────

  listDiagnosticTemplates: tenantProcedure
    .input(listPaginationSchema)
    .query(async ({ ctx, input }) => {
      const { search, page, pageSize } = input;
      const skip = page * pageSize;

      return ctx.withTenant(async (tx) => {
        const where = {
          deletedAt: null,
          ...(search
            ? {
                OR: [
                  { title: { contains: search, mode: "insensitive" as const } },
                  { content: { contains: search, mode: "insensitive" as const } },
                  { category: { contains: search, mode: "insensitive" as const } },
                ],
              }
            : {}),
        };

        const [items, total] = await Promise.all([
          tx.diagnosticTemplate.findMany({
            where,
            skip,
            take: pageSize,
            orderBy: { title: "asc" },
          }),
          tx.diagnosticTemplate.count({ where }),
        ]);

        return { items, total, pageCount: Math.ceil(total / pageSize) };
      });
    }),

  getDiagnosticTemplate: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        return tx.diagnosticTemplate.findFirst({
          where: { id: input.id, deletedAt: null },
        });
      });
    }),

  createDiagnosticTemplate: tenantProcedure
    .input(createDiagnosticTemplateSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        return tx.diagnosticTemplate.create({
          data: { tenantId: ctx.tenantId, ...input },
        });
      });
    }),

  updateDiagnosticTemplate: tenantProcedure
    .input(updateDiagnosticTemplateSchema.extend({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.withTenant(async (tx) => {
        return tx.diagnosticTemplate.update({ where: { id }, data });
      });
    }),

  deleteDiagnosticTemplate: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        return tx.diagnosticTemplate.update({
          where: { id: input.id },
          data: { deletedAt: new Date() },
        });
      });
    }),

  // ── DeviceCategories ──────────────────────────────────────────────────────

  listDeviceCategories: tenantProcedure.query(async ({ ctx }) => {
    return ctx.withTenant(async (tx) => {
      return tx.deviceCategory.findMany({ orderBy: { name: "asc" } });
    });
  }),

  createDeviceCategory: tenantProcedure
    .input(createDeviceCategorySchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        return tx.deviceCategory.create({
          data: { tenantId: ctx.tenantId, ...input },
        });
      });
    }),

  deleteDeviceCategory: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        return tx.deviceCategory.delete({ where: { id: input.id } });
      });
    }),

  // ── Devices ───────────────────────────────────────────────────────────────

  listDevices: tenantProcedure
    .input(
      listPaginationSchema.extend({
        categoryId: z.string().uuid().optional(),
        brand: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { search, page, pageSize, categoryId, brand } = input;
      const skip = page * pageSize;

      return ctx.withTenant(async (tx) => {
        const where = {
          deletedAt: null,
          ...(search
            ? {
                OR: [
                  { brand: { contains: search, mode: "insensitive" as const } },
                  { model: { contains: search, mode: "insensitive" as const } },
                ],
              }
            : {}),
          ...(categoryId ? { categoryId } : {}),
          ...(brand ? { brand: { contains: brand, mode: "insensitive" as const } } : {}),
        };

        const [items, total] = await Promise.all([
          tx.device.findMany({
            where,
            skip,
            take: pageSize,
            orderBy: [{ brand: "asc" }, { model: "asc" }],
            include: { category: true },
          }),
          tx.device.count({ where }),
        ]);

        return { items, total, pageCount: Math.ceil(total / pageSize) };
      });
    }),

  getDevice: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        return tx.device.findFirst({
          where: { id: input.id, deletedAt: null },
          include: { category: true },
        });
      });
    }),

  createDevice: tenantProcedure
    .input(createDeviceSchema)
    .mutation(async ({ ctx, input }) => {
      const { categoryId, attributes, ...rest } = input;
      const parsedAttributes = attributes
        ? (JSON.parse(attributes) as Record<string, unknown>)
        : null;
      return ctx.withTenant(async (tx) => {
        // Use unchecked create to avoid Prisma's connect/disconnect union ambiguity
        return tx.device.create({
          data: {
            tenantId: ctx.tenantId,
            brand: rest.brand,
            model: rest.model,
            active: rest.active ?? true,
            categoryId: categoryId ?? null,
            attributes: parsedAttributes,
          } as Parameters<typeof tx.device.create>[0]["data"],
        });
      });
    }),

  updateDevice: tenantProcedure
    .input(updateDeviceSchema.extend({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { id, categoryId, attributes, ...rest } = input;
      const parsedAttributes =
        attributes !== undefined
          ? attributes
            ? (JSON.parse(attributes) as Record<string, unknown>)
            : null
          : undefined;
      return ctx.withTenant(async (tx) => {
        return tx.device.update({
          where: { id },
          data: {
            ...(rest.brand !== undefined ? { brand: rest.brand } : {}),
            ...(rest.model !== undefined ? { model: rest.model } : {}),
            ...(rest.active !== undefined ? { active: rest.active } : {}),
            ...(categoryId !== undefined ? { categoryId: categoryId ?? null } : {}),
            ...(parsedAttributes !== undefined ? { attributes: parsedAttributes } : {}),
          } as Parameters<typeof tx.device.update>[0]["data"],
        });
      });
    }),

  deleteDevice: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        return tx.device.update({
          where: { id: input.id },
          data: { deletedAt: new Date() },
        });
      });
    }),
});
