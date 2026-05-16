import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, tenantProcedure } from "@/server/api/trpc";
import {
  createServiceSchema,
  updateServiceSchema,
  listServicesSchema,
  bulkAdjustSchema,
  renameTypeSchema,
  duplicateTypeSchema,
  sendServiceWhatsAppSchema,
  createDiagnosticTemplateSchema,
  updateDiagnosticTemplateSchema,
  listDiagnosticTemplatesSchema,
  createDeviceCategorySchema,
  updateDeviceCategorySchema,
  createDeviceSchema,
  updateDeviceSchema,
  listDevicesSchema,
  createServiceObservationSchema,
  updateServiceObservationSchema,
  listServiceObservationsSchema,
} from "@/lib/validators/catalog";
import { Prisma } from "@prisma/client";
import { sendTextMessage, formatPhone } from "@/lib/services/whatsapp-service";

function serviceToCents(s: { basePrice: Prisma.Decimal | null }) {
  return s.basePrice ? Math.round(Number(s.basePrice) * 100) : 0;
}

export const catalogRouter = createTRPCRouter({
  // ═══════════════════════════════════════
  // SERVICES
  // ═══════════════════════════════════════

  listServices: tenantProcedure
    .input(listServicesSchema)
    .query(async ({ ctx, input }) => {
      const page = input.page ?? 0;
      const pageSize = input.pageSize ?? 50;

      return ctx.withTenant(async (tx) => {
        const where: Prisma.ServiceWhereInput = { deletedAt: null };

        if (input.active !== undefined) {
          where.active = input.active;
        }

        if (input.serviceType) {
          where.serviceType = input.serviceType;
        }

        if (input.deviceModel) {
          where.deviceModel = { contains: input.deviceModel, mode: "insensitive" };
        }

        if (input.search?.trim()) {
          const term = input.search.trim();
          where.OR = [
            { name: { contains: term, mode: "insensitive" } },
            { serviceType: { contains: term, mode: "insensitive" } },
            { deviceModel: { contains: term, mode: "insensitive" } },
            { description: { contains: term, mode: "insensitive" } },
          ];
        }

        const [data, total] = await Promise.all([
          tx.service.findMany({
            where,
            orderBy: [{ serviceType: "asc" }, { deviceModel: "asc" }],
            skip: page * pageSize,
            take: pageSize,
          }),
          tx.service.count({ where }),
        ]);

        return {
          data: data.map((s) => ({
            ...s,
            basePrice: serviceToCents(s),
          })),
          total,
          pageCount: Math.ceil(total / pageSize),
        };
      });
    }),

  /** Returns all services grouped by serviceType (for the catalog card view) */
  listServicesGrouped: tenantProcedure
    .input(
      z.object({
        serviceType: z.string().optional(),
        deviceModel: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const where: Prisma.ServiceWhereInput = {
          deletedAt: null,
          active: true,
        };

        if (input.serviceType) {
          where.serviceType = input.serviceType;
        }

        if (input.deviceModel) {
          where.deviceModel = { contains: input.deviceModel, mode: "insensitive" };
        }

        const data = await tx.service.findMany({
          where,
          orderBy: [{ serviceType: "asc" }, { deviceModel: "asc" }],
        });

        // Group by serviceType
        const groups: Record<string, Array<{
          id: string;
          name: string;
          serviceType: string | null;
          deviceModel: string | null;
          description: string | null;
          basePrice: number;
          estimatedTime: string | null;
        }>> = {};

        for (const s of data) {
          const key = s.serviceType ?? "Outros";
          if (!groups[key]) {
            groups[key] = [];
          }
          groups[key].push({
            ...s,
            basePrice: serviceToCents(s),
          });
        }

        return groups;
      });
    }),

  /** Distinct service types for filter dropdowns */
  listServiceTypes: tenantProcedure.query(async ({ ctx }) => {
    return ctx.withTenant(async (tx) => {
      const result = await tx.service.findMany({
        where: { deletedAt: null, serviceType: { not: null } },
        select: { serviceType: true },
        distinct: ["serviceType"],
        orderBy: { serviceType: "asc" },
      });
      return result.map((r) => r.serviceType).filter(Boolean) as string[];
    });
  }),

  /** Distinct device models for filter dropdowns */
  listDeviceModels: tenantProcedure
    .input(z.object({ serviceType: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const where: Prisma.ServiceWhereInput = {
          deletedAt: null,
          deviceModel: { not: null },
        };
        if (input?.serviceType) {
          where.serviceType = input.serviceType;
        }
        const result = await tx.service.findMany({
          where,
          select: { deviceModel: true },
          distinct: ["deviceModel"],
          orderBy: { deviceModel: "asc" },
        });
        return result.map((r) => r.deviceModel).filter(Boolean) as string[];
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
        return {
          ...service,
          basePrice: serviceToCents(service),
        };
      });
    }),

  createService: tenantProcedure
    .input(createServiceSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const name = `${input.serviceType} - ${input.deviceModel}`;
        return tx.service.create({
          data: {
            tenantId: ctx.tenantId,
            name,
            serviceType: input.serviceType,
            deviceModel: input.deviceModel,
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

        const name = `${input.serviceType} - ${input.deviceModel}`;
        return tx.service.update({
          where: { id: input.id },
          data: {
            name,
            serviceType: input.serviceType,
            deviceModel: input.deviceModel,
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

  /** Bulk adjust price for all services of a given type (+/- centavos) */
  bulkAdjustPrice: tenantProcedure
    .input(bulkAdjustSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const services = await tx.service.findMany({
          where: {
            serviceType: input.serviceType,
            deletedAt: null,
          },
        });

        if (services.length === 0) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Nenhum servico encontrado para este tipo" });
        }

        const adjustDecimal = new Prisma.Decimal(input.adjustmentCents).div(100);

        let count = 0;
        for (const s of services) {
          const newPrice = s.basePrice.add(adjustDecimal);
          if (newPrice.lessThan(0)) continue;
          await tx.service.update({
            where: { id: s.id },
            data: { basePrice: newPrice },
          });
          count++;
        }

        return { updated: count };
      });
    }),

  /** Delete all services of a given type (soft delete) */
  deleteByType: tenantProcedure
    .input(z.object({ serviceType: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const result = await tx.service.updateMany({
          where: {
            serviceType: input.serviceType,
            deletedAt: null,
          },
          data: { deletedAt: new Date() },
        });

        return { deleted: result.count };
      });
    }),

  /** Rename a service type across all services */
  renameType: tenantProcedure
    .input(renameTypeSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const services = await tx.service.findMany({
          where: {
            serviceType: input.oldName,
            deletedAt: null,
          },
        });

        if (services.length === 0) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Tipo de servico nao encontrado" });
        }

        for (const s of services) {
          const newName = `${input.newName} - ${s.deviceModel ?? ""}`.trim();
          await tx.service.update({
            where: { id: s.id },
            data: {
              serviceType: input.newName,
              name: newName,
            },
          });
        }

        return { updated: services.length };
      });
    }),

  /** Duplicate all services of a type with a new type name */
  duplicateType: tenantProcedure
    .input(duplicateTypeSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const services = await tx.service.findMany({
          where: {
            serviceType: input.sourceType,
            deletedAt: null,
          },
        });

        if (services.length === 0) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Tipo de servico nao encontrado" });
        }

        for (const s of services) {
          const newName = `${input.newType} - ${s.deviceModel ?? ""}`.trim();
          await tx.service.create({
            data: {
              tenantId: ctx.tenantId,
              name: newName,
              serviceType: input.newType,
              deviceModel: s.deviceModel,
              description: s.description,
              basePrice: s.basePrice,
              estimatedTime: s.estimatedTime,
            },
          });
        }

        return { created: services.length };
      });
    }),

  /** Send quote via WhatsApp */
  sendServiceWhatsApp: tenantProcedure
    .input(sendServiceWhatsAppSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const service = await tx.service.findUnique({
          where: { id: input.serviceId },
        });
        if (!service || service.deletedAt) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Servico nao encontrado" });
        }

        // Get installment info from settings
        const creditCard = await tx.paymentMethod.findFirst({
          where: { type: "CREDIT_CARD", active: true },
          include: { installmentRules: { orderBy: { installments: "desc" }, take: 1 } },
        });

        const maxInstallments = creditCard?.installmentRules[0]?.installments ?? 12;
        const priceCents = serviceToCents(service);
        const priceFormatted = (priceCents / 100).toLocaleString("pt-BR", {
          style: "currency",
          currency: "BRL",
        });
        const installmentValue = (priceCents / maxInstallments / 100).toLocaleString("pt-BR", {
          style: "currency",
          currency: "BRL",
        });
        const pixDiscount = 5;
        const pixPrice = ((priceCents * (100 - pixDiscount)) / 10000).toLocaleString("pt-BR", {
          style: "currency",
          currency: "BRL",
        });

        const message = [
          `Ola ${input.clientName}! Segue o orcamento da Arena Tech:`,
          "",
          `\u{1F527} ORCAMENTO`,
          `\u{1F4F1} Servico: ${service.serviceType ?? service.name}`,
          `\u{1F4F2} Aparelho: ${service.deviceModel ?? "-"}`,
          `\u{1F4B0} Valor: ${priceFormatted}`,
          `\u{1F4B3} Parcelamento: ate ${maxInstallments}x de ${installmentValue} sem juros`,
          `\u{1F4B5} Desconto PIX: ${pixDiscount}% = ${pixPrice}`,
          `\u{2705} Valido por 48h`,
          "",
          "Arena Tech - Assistencia Tecnica",
        ].join("\n");

        const result = await sendTextMessage(
          formatPhone(input.clientPhone),
          message,
        );

        if (!result.success) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: result.error ?? "Erro ao enviar WhatsApp",
          });
        }

        return { success: true, messageId: result.messageId };
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

  // ═══════════════════════════════════════
  // SERVICE OBSERVATIONS
  // ═══════════════════════════════════════

  listServiceObservations: tenantProcedure
    .input(listServiceObservationsSchema)
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const where: Prisma.ServiceObservationWhereInput = {};
        if (input.active !== undefined) where.active = input.active;

        const observations = await tx.serviceObservation.findMany({
          where,
          orderBy: { title: "asc" },
        });

        // Filter by service type and device model client-side (JSON fields)
        return observations.filter((obs) => {
          if (input.serviceType) {
            const types = obs.serviceTypes as string[] | null;
            if (types && types.length > 0 && !types.includes(input.serviceType)) {
              return false;
            }
          }
          if (input.deviceModel) {
            const models = obs.deviceModels as string[] | null;
            if (models && models.length > 0 && !models.includes(input.deviceModel)) {
              return false;
            }
          }
          return true;
        });
      });
    }),

  createServiceObservation: tenantProcedure
    .input(createServiceObservationSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const obs = await tx.serviceObservation.create({
          data: {
            tenantId: ctx.tenantId,
            title: input.title,
            observation: input.observation,
            serviceTypes: input.serviceTypes ?? Prisma.JsonNull,
            deviceModels: input.deviceModels ?? Prisma.JsonNull,
          },
        });
        return { id: obs.id };
      });
    }),

  updateServiceObservation: tenantProcedure
    .input(updateServiceObservationSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const existing = await tx.serviceObservation.findUnique({ where: { id: input.id } });
        if (!existing) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Observacao nao encontrada" });
        }

        await tx.serviceObservation.update({
          where: { id: input.id },
          data: {
            title: input.title,
            observation: input.observation,
            serviceTypes: input.serviceTypes ?? Prisma.JsonNull,
            deviceModels: input.deviceModels ?? Prisma.JsonNull,
          },
        });
        return { success: true };
      });
    }),

  toggleServiceObservation: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const obs = await tx.serviceObservation.findUnique({ where: { id: input.id } });
        if (!obs) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Observacao nao encontrada" });
        }

        await tx.serviceObservation.update({
          where: { id: input.id },
          data: { active: !obs.active },
        });
        return { success: true, active: !obs.active };
      });
    }),

  deleteServiceObservation: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        await tx.serviceObservation.delete({ where: { id: input.id } });
        return { success: true };
      });
    }),

  // ═══════════════════════════════════════
  // SERVICE TYPES (Catálogo)
  // ═══════════════════════════════════════

  listServiceTypesWithCount: tenantProcedure
    .input(z.object({ active: z.boolean().optional() }).optional())
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const where: any = { deletedAt: null };
        if (input?.active !== undefined) where.active = input.active;
        return tx.serviceType.findMany({
          where,
          orderBy: { name: "asc" },
          include: { _count: { select: { services: true } } },
        });
      });
    }),

  createServiceType: tenantProcedure
    .input(z.object({ name: z.string().min(2).max(100) }))
    .mutation(async ({ ctx, input }) => {
      const userRole = ctx.session.availableTenants.find((t) => t.id === ctx.tenantId)?.role;
      if (!userRole || userRole === "operator") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissao" });
      }
      return ctx.withTenant(async (tx) => {
        const slug = input.name
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "");
        return tx.serviceType.create({
          data: { tenantId: ctx.tenantId, name: input.name, slug },
        });
      });
    }),

  renameServiceType: tenantProcedure
    .input(z.object({ id: z.string().uuid(), newName: z.string().min(2).max(100) }))
    .mutation(async ({ ctx, input }) => {
      const userRole = ctx.session.availableTenants.find((t) => t.id === ctx.tenantId)?.role;
      if (!userRole || userRole === "operator") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissao" });
      }
      return ctx.withTenant(async (tx) => {
        const slug = input.newName
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "");
        return tx.serviceType.update({
          where: { id: input.id },
          data: { name: input.newName, slug },
        });
      });
    }),

  duplicateServiceType: tenantProcedure
    .input(z.object({ sourceId: z.string().uuid(), newName: z.string().min(2).max(100) }))
    .mutation(async ({ ctx, input }) => {
      const userRole = ctx.session.availableTenants.find((t) => t.id === ctx.tenantId)?.role;
      if (!userRole || userRole === "operator") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissao" });
      }
      return ctx.withTenant(async (tx) => {
        const slug = input.newName
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "");

        const newType = await tx.serviceType.create({
          data: { tenantId: ctx.tenantId, name: input.newName, slug },
        });

        const sourceServices = await tx.service.findMany({
          where: { serviceTypeId: input.sourceId, deletedAt: null },
        });

        for (const s of sourceServices) {
          await tx.service.create({
            data: {
              tenantId: ctx.tenantId,
              serviceTypeId: newType.id,
              serviceType: input.newName,
              deviceModel: s.deviceModel,
              name: s.name,
              description: s.description,
              basePrice: s.basePrice,
              estimatedTime: s.estimatedTime,
              active: true,
            },
          });
        }

        return { type: newType, copiedCount: sourceServices.length };
      });
    }),

  deleteServiceType: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const userRole = ctx.session.availableTenants.find((t) => t.id === ctx.tenantId)?.role;
      if (!userRole || userRole === "operator") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissao" });
      }
      return ctx.withTenant(async (tx) => {
        const now = new Date();
        await tx.service.updateMany({
          where: { serviceTypeId: input.id, deletedAt: null },
          data: { deletedAt: now },
        });
        await tx.serviceType.update({
          where: { id: input.id },
          data: { deletedAt: now },
        });
        return { success: true };
      });
    }),

  bulkAdjustPrices: tenantProcedure
    .input(z.object({
      serviceTypeId: z.string().uuid().optional(),
      adjustmentPercent: z.number().min(-100).max(1000),
    }))
    .mutation(async ({ ctx, input }) => {
      const userRole = ctx.session.availableTenants.find((t) => t.id === ctx.tenantId)?.role;
      if (!userRole || userRole === "operator") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissao" });
      }
      return ctx.withTenant(async (tx) => {
        const where: any = { deletedAt: null };
        if (input.serviceTypeId) where.serviceTypeId = input.serviceTypeId;

        const services = await tx.service.findMany({ where });
        const factor = 1 + (input.adjustmentPercent / 100);
        let count = 0;

        for (const s of services) {
          const newPrice = Math.max(0, Number(s.basePrice) * factor);
          await tx.service.update({
            where: { id: s.id },
            data: { basePrice: Math.round(newPrice * 100) / 100 },
          });
          count++;
        }

        return { adjustedCount: count };
      });
    }),

  // ═══════════════════════════════════════
  // CATALOG DEVICES (Catálogo)
  // ═══════════════════════════════════════

  listCatalogDevices: tenantProcedure
    .input(z.object({
      categoryId: z.string().uuid().optional(),
      available: z.boolean().optional(),
      featured: z.boolean().optional(),
      search: z.string().optional(),
      page: z.number().int().min(0).optional(),
      pageSize: z.number().int().min(1).max(100).optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const page = input?.page ?? 0;
      const pageSize = input?.pageSize ?? 25;
      return ctx.withTenant(async (tx) => {
        const where: any = { deletedAt: null };
        if (input?.categoryId) where.categoryId = input.categoryId;
        if (input?.available !== undefined) where.available = input.available;
        if (input?.featured !== undefined) where.featured = input.featured;
        if (input?.search) {
          where.name = { contains: input.search, mode: "insensitive" };
        }
        const [data, total] = await Promise.all([
          tx.catalogDevice.findMany({
            where,
            include: { category: true },
            orderBy: { order: "asc" },
            skip: page * pageSize,
            take: pageSize,
          }),
          tx.catalogDevice.count({ where }),
        ]);
        return { data, total, pageCount: Math.ceil(total / pageSize) };
      });
    }),

  getCatalogDevice: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        return tx.catalogDevice.findUnique({
          where: { id: input.id },
          include: { category: true },
        });
      });
    }),

  createCatalogDevice: tenantProcedure
    .input(z.object({
      categoryId: z.string().uuid().optional().nullable(),
      name: z.string().min(2).max(200),
      condition: z.string().max(50).optional().nullable(),
      description: z.string().max(2000).optional().nullable(),
      price: z.number().min(0).optional().nullable(),
      promotionalPrice: z.number().min(0).optional().nullable(),
      imageUrl: z.string().optional().nullable(),
      available: z.boolean().optional(),
      featured: z.boolean().optional(),
      order: z.number().int().min(0).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userRole = ctx.session.availableTenants.find((t) => t.id === ctx.tenantId)?.role;
      if (!userRole || userRole === "operator") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissao" });
      }
      return ctx.withTenant(async (tx) => {
        return tx.catalogDevice.create({
          data: {
            tenantId: ctx.tenantId,
            categoryId: input.categoryId || null,
            name: input.name,
            condition: input.condition || null,
            description: input.description || null,
            price: input.price ?? null,
            promotionalPrice: input.promotionalPrice ?? null,
            imageUrl: input.imageUrl || null,
            available: input.available ?? true,
            featured: input.featured ?? false,
            order: input.order ?? 0,
            priceUpdatedAt: input.price ? new Date() : null,
          },
        });
      });
    }),

  updateCatalogDevice: tenantProcedure
    .input(z.object({
      id: z.string().uuid(),
      categoryId: z.string().uuid().optional().nullable(),
      name: z.string().min(2).max(200).optional(),
      condition: z.string().max(50).optional().nullable(),
      description: z.string().max(2000).optional().nullable(),
      price: z.number().min(0).optional().nullable(),
      promotionalPrice: z.number().min(0).optional().nullable(),
      imageUrl: z.string().optional().nullable(),
      available: z.boolean().optional(),
      featured: z.boolean().optional(),
      order: z.number().int().min(0).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userRole = ctx.session.availableTenants.find((t) => t.id === ctx.tenantId)?.role;
      if (!userRole || userRole === "operator") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissao" });
      }
      return ctx.withTenant(async (tx) => {
        const { id, ...data } = input;
        const existing = await tx.catalogDevice.findUnique({ where: { id } });
        const updateData: any = { ...data };
        // Update priceUpdatedAt if price changed
        if (data.price !== undefined && existing && Number(existing.price) !== data.price) {
          updateData.priceUpdatedAt = new Date();
        }
        return tx.catalogDevice.update({ where: { id }, data: updateData });
      });
    }),

  deleteCatalogDevice: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const userRole = ctx.session.availableTenants.find((t) => t.id === ctx.tenantId)?.role;
      if (!userRole || userRole === "operator") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissao" });
      }
      return ctx.withTenant(async (tx) => {
        await tx.catalogDevice.update({ where: { id: input.id }, data: { deletedAt: new Date() } });
        return { success: true };
      });
    }),

  // ═══════════════════════════════════════
  // CATALOG DEVICE CATEGORIES (Catálogo)
  // ═══════════════════════════════════════

  listCatalogCategories: tenantProcedure
    .query(async ({ ctx }) => {
      return ctx.withTenant(async (tx) => {
        return tx.catalogDeviceCategory.findMany({
          where: { deletedAt: null },
          orderBy: { order: "asc" },
          include: { _count: { select: { devices: true } } },
        });
      });
    }),

  createCatalogCategory: tenantProcedure
    .input(z.object({ name: z.string().min(2).max(100), order: z.number().int().min(0).optional() }))
    .mutation(async ({ ctx, input }) => {
      const userRole = ctx.session.availableTenants.find((t) => t.id === ctx.tenantId)?.role;
      if (!userRole || userRole === "operator") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissao" });
      }
      return ctx.withTenant(async (tx) => {
        const slug = input.name
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "");
        return tx.catalogDeviceCategory.create({
          data: { tenantId: ctx.tenantId, name: input.name, slug, order: input.order ?? 0 },
        });
      });
    }),

  updateCatalogCategory: tenantProcedure
    .input(z.object({ id: z.string().uuid(), name: z.string().min(2).max(100).optional(), order: z.number().int().min(0).optional() }))
    .mutation(async ({ ctx, input }) => {
      const userRole = ctx.session.availableTenants.find((t) => t.id === ctx.tenantId)?.role;
      if (!userRole || userRole === "operator") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissao" });
      }
      return ctx.withTenant(async (tx) => {
        const data: any = {};
        if (input.name) {
          data.name = input.name;
          data.slug = input.name
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "");
        }
        if (input.order !== undefined) data.order = input.order;
        return tx.catalogDeviceCategory.update({ where: { id: input.id }, data });
      });
    }),

  deleteCatalogCategory: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const userRole = ctx.session.availableTenants.find((t) => t.id === ctx.tenantId)?.role;
      if (!userRole || userRole === "operator") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissao" });
      }
      return ctx.withTenant(async (tx) => {
        await tx.catalogDeviceCategory.update({ where: { id: input.id }, data: { deletedAt: new Date() } });
        return { success: true };
      });
    }),

  // ═══════════════════════════════════════
  // INSTALLMENT SIMULATOR (Catálogo)
  // ═══════════════════════════════════════

  simulateInstallments: tenantProcedure
    .input(z.object({
      totalAmount: z.number().min(0.01, "Valor deve ser positivo"),
      downPayment: z.number().min(0).optional(),
    }))
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const amountToFinance = Math.max(0, input.totalAmount - (input.downPayment ?? 0));
        if (amountToFinance <= 0) return { parcelas: [], amountToFinance: 0 };

        // Load installment rules from settings
        const rules = await tx.installmentRule.findMany({
          orderBy: { installments: "asc" },
        });

        const parcelas: Array<{
          installments: number
          rate: number
          totalWithInterest: number
          installmentValue: number
        }> = [];

        // Add cash/debit (1x, rate 0)
        parcelas.push({
          installments: 1,
          rate: 0,
          totalWithInterest: amountToFinance,
          installmentValue: amountToFinance,
        });

        for (const r of rules) {
          const rate = Number(r.feePercent);
          if (rate <= 0) continue; // Skip zero-rate (legacy rule RN-10)

          // Gross up formula from legacy: bruto = base * 100 / (100 - taxa)
          const totalWithInterest = amountToFinance * 100 / (100 - rate);
          const installmentValue = totalWithInterest / r.installments;

          parcelas.push({
            installments: r.installments,
            rate,
            totalWithInterest: Math.round(totalWithInterest * 100) / 100,
            installmentValue: Math.round(installmentValue * 100) / 100,
          });
        }

        return { parcelas, amountToFinance };
      });
    }),
});
