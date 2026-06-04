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
  createServiceObservationSchema,
  updateServiceObservationSchema,
  listServiceObservationsSchema,
} from "@/lib/validators/catalog";
import { Prisma } from "@prisma/client";
import { sendPdfWithFallback } from "@/lib/whatsapp/send-with-fallback";
import { createSignedPayloadToken } from "@/lib/whatsapp/signed-payload-token";
import type { ServiceQuotePdfData } from "@/lib/pdf/service-quote-pdf";
import { logger } from "@/lib/logger";

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

  /**
   * Envia o orcamento avulso de servico por WhatsApp (Cloud API) com PDF anexado.
   * Stateless: monta a mensagem + PDF transiente (token assinado) e usa o
   * fallback inteligente — texto+link na janela 24h, ou template
   * `servico_orcamento_pdf` (HEADER DOCUMENT) fora dela. Paridade Laravel
   * ServicoController::enviarOrcamentoWhatsApp.
   */
  sendServiceWhatsApp: tenantProcedure
    .input(sendServiceWhatsAppSchema)
    .mutation(async ({ ctx, input }) => {
      // ETAPA 1 — fetch em tx curta (leituras, sem IO externo)
      const built = await ctx.withTenant(async (tx) => {
        const service = await tx.service.findUnique({ where: { id: input.serviceId } });
        if (!service || service.deletedAt) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Servico nao encontrado" });
        }
        const assistance = await tx.tenantAssistanceSettings.findUnique({
          where: { tenantId: ctx.tenantId },
        });
        const maxInstallments = assistance?.installmentsNoInterest ?? 12;
        const pixDiscount = Number(assistance?.pixDiscount ?? 5);

        const observations = await tx.serviceObservation.findMany({
          where: { tenantId: ctx.tenantId, active: true },
          orderBy: { createdAt: "asc" },
        });
        const relevantObs = observations.filter((o) => {
          const types = (o.serviceTypes as string[] | null) ?? [];
          const models = (o.deviceModels as string[] | null) ?? [];
          if (types.length === 0 && models.length === 0) return true;
          const typeMatch = service.serviceType && types.includes(service.serviceType);
          const modelMatch = service.deviceModel && models.includes(service.deviceModel);
          return typeMatch || modelMatch;
        });

        const settings = await tx.tenantSettings.findUnique({
          where: { tenantId: ctx.tenantId },
        });
        const nomeLoja = settings?.tradeName ?? "Arena Tech";

        const brl = (cents: number) =>
          (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
        const priceCents = serviceToCents(service);
        const priceFormatted = brl(priceCents);
        const installmentValue = brl(priceCents / maxInstallments);
        const pixPriceCents = (priceCents * (100 - pixDiscount)) / 100;
        const pixPrice = brl(pixPriceCents);
        const serviceName = service.serviceType ?? service.name;
        const deviceModel = service.deviceModel ?? "-";
        const obsList = relevantObs.map((o) => o.observation);

        // Texto (usado na janela 24h pelo fallback).
        const lines = [
          `Ola ${input.clientName}! Segue o orcamento da ${nomeLoja}:`,
          "",
          `\u{1F527} ORCAMENTO`,
          `\u{1F4F1} Servico: ${serviceName}`,
          `\u{1F4F2} Aparelho: ${deviceModel}`,
          `\u{1F4B0} Valor: ${priceFormatted}`,
        ];
        if (maxInstallments > 1) {
          lines.push(`\u{1F4B3} Parcelamento: ate ${maxInstallments}x de ${installmentValue} sem juros`);
        }
        if (pixDiscount > 0) {
          lines.push(`\u{1F4B5} A vista (PIX): ${pixPrice} com ${pixDiscount}% de desconto`);
        }
        if (obsList.length > 0) {
          lines.push("", "\u{1F4DD} Observacoes:");
          for (const obs of obsList) lines.push(`\u{2022} ${obs}`);
        }
        lines.push("", "\u{2705} Valido por 48h", `${nomeLoja} - Assistencia Tecnica`);

        const generatedAt = new Intl.DateTimeFormat("pt-BR", {
          dateStyle: "short",
          timeStyle: "short",
          timeZone: "America/Sao_Paulo",
        }).format(new Date());

        const pdfData: ServiceQuotePdfData = {
          storeName: nomeLoja,
          customerName: input.clientName,
          serviceName,
          deviceModel,
          priceFormatted,
          installments: maxInstallments,
          installmentValueFormatted: installmentValue,
          pixDiscountPercent: pixDiscount,
          pixPriceFormatted: pixPrice,
          observations: obsList,
          generatedAt,
        };

        return { message: lines.join("\n"), pdfData };
      });

      // ETAPA 2 — token + WhatsApp Cloud (fora da tx).
      const token = createSignedPayloadToken<ServiceQuotePdfData>(built.pdfData, 60 * 60 * 1000);
      const appUrl =
        process.env.NEXT_PUBLIC_APP_URL ??
        process.env.NEXTAUTH_URL ??
        "https://app.arenatechpi.com.br";
      const pdfUrl = `${appUrl}/api/whatsapp-media/service-quote/pdf/${token}`;

      const sendResult = await sendPdfWithFallback({
        phone: input.clientPhone,
        pdfUrl,
        fileName: "orcamento.pdf",
        caption: built.message,
        contexto: "servico_orcamento_pdf",
        params: [input.clientName],
        log: { tenantId: ctx.tenantId, originType: "servico_orcamento" },
      });

      if (!sendResult.success) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Falha ao enviar WhatsApp: ${sendResult.error ?? "erro desconhecido"}`,
        });
      }

      logger.info("Service quote WhatsApp sent", {
        tenantId: ctx.tenantId,
        serviceId: input.serviceId,
        via: sendResult.via,
      });

      return { success: true, via: sendResult.via, messageId: sendResult.messageId };
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
      imageProvider: z.enum(["cloudinary", "minio", "external"]).optional().nullable(),
      imageProviderPublicId: z.string().max(500).optional().nullable(),
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
            imageProvider: input.imageProvider ?? null,
            imageProviderPublicId: input.imageProviderPublicId ?? null,
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
      imageProvider: z.enum(["cloudinary", "minio", "external"]).optional().nullable(),
      imageProviderPublicId: z.string().max(500).optional().nullable(),
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

  /** Duplica categoria do catalogo (com dispositivos). Paridade duplicarCategoria. */
  duplicateCatalogCategory: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const userRole = ctx.session.availableTenants.find((t) => t.id === ctx.tenantId)?.role;
      if (!userRole || userRole === "operator") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissao" });
      }
      return ctx.withTenant(async (tx) => {
        const source = await tx.catalogDeviceCategory.findUnique({
          where: { id: input.id },
          include: { devices: { where: { deletedAt: null } } },
        });
        if (!source) throw new TRPCError({ code: "NOT_FOUND" });
        const newName = `${source.name} (cópia)`;
        const slugBase = newName.toLowerCase().normalize("NFD")
          .replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        // Garante slug unico para o tenant
        let slug = slugBase;
        let suffix = 1;
        while (await tx.catalogDeviceCategory.findFirst({
          where: { tenantId: ctx.tenantId, slug, deletedAt: null },
          select: { id: true },
        })) {
          suffix += 1;
          slug = `${slugBase}-${suffix}`;
        }
        const created = await tx.catalogDeviceCategory.create({
          data: {
            tenantId: ctx.tenantId,
            name: newName,
            slug,
            order: source.order,
          },
        });
        // Copia devices (sem ids/timestamps)
        if (source.devices.length > 0) {
          await tx.catalogDevice.createMany({
            data: source.devices.map((d) => ({
              tenantId: ctx.tenantId,
              categoryId: created.id,
              name: d.name,
              condition: d.condition,
              description: d.description,
              price: d.price,
              promotionalPrice: d.promotionalPrice,
              imageUrl: d.imageUrl,
              imageProvider: d.imageProvider,
              imageProviderPublicId: d.imageProviderPublicId,
              available: d.available,
              featured: d.featured,
              order: d.order,
            })),
          });
        }
        return created;
      });
    }),

  /** Duplica aparelho do catalogo. Paridade duplicar aparelho. */
  duplicateCatalogDevice: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const userRole = ctx.session.availableTenants.find((t) => t.id === ctx.tenantId)?.role;
      if (!userRole || userRole === "operator") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissao" });
      }
      return ctx.withTenant(async (tx) => {
        const source = await tx.catalogDevice.findUnique({ where: { id: input.id } });
        if (!source) throw new TRPCError({ code: "NOT_FOUND" });
        return tx.catalogDevice.create({
          data: {
            tenantId: ctx.tenantId,
            categoryId: source.categoryId,
            name: `${source.name} (cópia)`,
            condition: source.condition,
            description: source.description,
            price: source.price,
            promotionalPrice: source.promotionalPrice,
            imageUrl: source.imageUrl,
            imageProvider: source.imageProvider,
            imageProviderPublicId: source.imageProviderPublicId,
            available: source.available,
            featured: source.featured,
            order: source.order,
          },
        });
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
