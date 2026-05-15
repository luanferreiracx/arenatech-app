import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Prisma } from "@prisma/client";
import { createTRPCRouter, tenantProcedure } from "@/server/api/trpc";
import {
  createValuationSchema,
  updateValuationSchema,
  listValuationsSchema,
  bulkAdjustSchema,
  bulkAdjustFixedSchema,
  duplicateModelSchema,
  deleteModelSchema,
  sendValuationWhatsAppSchema,
  STORAGE_OPTIONS,
  BATTERY_HEALTH_OPTIONS,
} from "@/lib/validators/valuation";
import { logger } from "@/lib/logger";

function decimalToCents(v: Prisma.Decimal | null | undefined): number {
  if (v == null) return 0;
  return Math.round(Number(v) * 100);
}

function centsToPrisma(cents: number): Prisma.Decimal {
  return new Prisma.Decimal(cents / 100);
}

export const valuationRouter = createTRPCRouter({
  /** List valuations with optional filters */
  list: tenantProcedure
    .input(listValuationsSchema)
    .query(async ({ ctx, input }) => {
      const page = input.page ?? 0;
      const pageSize = input.pageSize ?? 50;

      return ctx.withTenant(async (tx) => {
        const where: Prisma.DeviceValuationWhereInput = {
          deletedAt: null,
        };
        if (input.modelo) where.modelo = input.modelo;
        if (input.armazenamento) where.armazenamento = input.armazenamento;

        const [data, total] = await Promise.all([
          tx.deviceValuation.findMany({
            where,
            orderBy: [{ modelo: "asc" }, { armazenamento: "asc" }, { saudeBateria: "asc" }],
            skip: page * pageSize,
            take: pageSize,
          }),
          tx.deviceValuation.count({ where }),
        ]);

        return {
          data: data.map((v) => ({
            ...v,
            valor: decimalToCents(v.valor),
          })),
          total,
          pageCount: Math.ceil(total / pageSize),
        };
      });
    }),

  /** Get distinct models for filter */
  listModels: tenantProcedure.query(async ({ ctx }) => {
    return ctx.withTenant(async (tx) => {
      const result = await tx.deviceValuation.findMany({
        where: { deletedAt: null },
        select: { modelo: true },
        distinct: ["modelo"],
        orderBy: { modelo: "asc" },
      });
      return result.map((r) => r.modelo);
    });
  }),

  /** Create a valuation entry */
  create: tenantProcedure
    .input(createValuationSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const valuation = await tx.deviceValuation.create({
          data: {
            tenantId: ctx.tenantId,
            modelo: input.modelo,
            armazenamento: input.armazenamento,
            saudeBateria: input.saudeBateria,
            valor: centsToPrisma(input.valor),
            validadeDias: input.validadeDias ?? 7,
          },
        });
        return { id: valuation.id };
      });
    }),

  /** Update a valuation entry */
  update: tenantProcedure
    .input(updateValuationSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const existing = await tx.deviceValuation.findUnique({ where: { id: input.id } });
        if (!existing || existing.deletedAt) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Avaliacao nao encontrada" });
        }

        await tx.deviceValuation.update({
          where: { id: input.id },
          data: {
            modelo: input.modelo,
            armazenamento: input.armazenamento,
            saudeBateria: input.saudeBateria,
            valor: centsToPrisma(input.valor),
            validadeDias: input.validadeDias,
          },
        });
        return { success: true };
      });
    }),

  /** Delete a valuation entry (soft) */
  delete: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        await tx.deviceValuation.update({
          where: { id: input.id },
          data: { deletedAt: new Date() },
        });
        return { success: true };
      });
    }),

  /** Bulk adjust prices for a model by percentage */
  bulkAdjust: tenantProcedure
    .input(bulkAdjustSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const valuations = await tx.deviceValuation.findMany({
          where: { modelo: input.modelo, deletedAt: null },
        });

        if (valuations.length === 0) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Nenhuma avaliacao encontrada para este modelo" });
        }

        const factor = 1 + input.adjustPercent / 100;
        let updated = 0;

        for (const v of valuations) {
          const currentValue = Number(v.valor);
          const newValue = Math.round(currentValue * factor * 100) / 100;

          await tx.deviceValuation.update({
            where: { id: v.id },
            data: { valor: new Prisma.Decimal(newValue) },
          });
          updated++;
        }

        logger.info("Bulk adjust valuations", {
          modelo: input.modelo,
          adjustPercent: input.adjustPercent,
          updated,
        });

        return { updated };
      });
    }),

  /** Duplicate all entries from one model to another */
  duplicateModel: tenantProcedure
    .input(duplicateModelSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const sourceEntries = await tx.deviceValuation.findMany({
          where: { modelo: input.sourceModelo, deletedAt: null },
        });

        if (sourceEntries.length === 0) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Modelo de origem nao encontrado" });
        }

        let created = 0;
        for (const entry of sourceEntries) {
          await tx.deviceValuation.create({
            data: {
              tenantId: ctx.tenantId,
              modelo: input.targetModelo,
              armazenamento: entry.armazenamento,
              saudeBateria: entry.saudeBateria,
              valor: entry.valor,
              validadeDias: entry.validadeDias,
            },
          });
          created++;
        }

        logger.info("Duplicate model valuations", {
          source: input.sourceModelo,
          target: input.targetModelo,
          created,
        });

        return { created };
      });
    }),

  /** Bulk adjust prices by fixed R$ amount (like Laravel) */
  bulkAdjustFixed: tenantProcedure
    .input(bulkAdjustFixedSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const valuations = await tx.deviceValuation.findMany({
          where: { modelo: input.modelo, deletedAt: null },
        });

        if (valuations.length === 0) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Nenhuma avaliacao encontrada para este modelo" });
        }

        const adjustReais = input.adjustAmount / 100;
        let updated = 0;

        for (const v of valuations) {
          const currentValue = Number(v.valor);
          const newValue = Math.max(0, currentValue + adjustReais);

          await tx.deviceValuation.update({
            where: { id: v.id },
            data: { valor: new Prisma.Decimal(newValue) },
          });
          updated++;
        }

        logger.info("Bulk adjust fixed valuations", {
          modelo: input.modelo,
          adjustAmount: input.adjustAmount,
          updated,
        });

        return { updated };
      });
    }),

  /** Delete all valuations for a model */
  deleteModel: tenantProcedure
    .input(deleteModelSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const result = await tx.deviceValuation.updateMany({
          where: { modelo: input.modelo, deletedAt: null },
          data: { deletedAt: new Date() },
        });

        logger.info("Delete model valuations", {
          modelo: input.modelo,
          deleted: result.count,
        });

        return { deleted: result.count };
      });
    }),

  /** Get distinct storage options for a model */
  listStorageOptions: tenantProcedure.query(async () => {
    return STORAGE_OPTIONS;
  }),

  /** Get distinct battery health options */
  listBatteryOptions: tenantProcedure.query(async () => {
    return BATTERY_HEALTH_OPTIONS;
  }),

  /** Format valuation table as WhatsApp text message */
  formatWhatsAppMessage: tenantProcedure
    .input(sendValuationWhatsAppSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const valuations = await tx.deviceValuation.findMany({
          where: { modelo: input.modelo, deletedAt: null },
          orderBy: [{ armazenamento: "asc" }, { saudeBateria: "asc" }],
        });

        if (valuations.length === 0) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Nenhuma avaliacao encontrada para este modelo" });
        }

        // Get validade from first entry
        const validadeDias = valuations[0]?.validadeDias ?? 7;
        const nome = input.customerName ?? "Cliente";

        // Group by armazenamento
        const grouped = new Map<string, Array<{ saudeBateria: string; valor: Prisma.Decimal }>>();
        for (const v of valuations) {
          const key = v.armazenamento;
          if (!grouped.has(key)) grouped.set(key, []);
          grouped.get(key)!.push({ saudeBateria: v.saudeBateria, valor: v.valor });
        }

        // Build message
        let message = `*Avaliacao de Aparelho - Arena Tech*\n\n`;
        message += `Ola, ${nome}!\n\n`;
        message += `Segue a tabela de avaliacao para *${input.modelo}*:\n\n`;

        for (const [armazenamento, items] of grouped.entries()) {
          message += `*${armazenamento}:*\n`;
          for (const item of items) {
            const valor = Number(item.valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
            message += `  - Bateria ${item.saudeBateria}: *${valor}*\n`;
          }
          message += `\n`;
        }

        message += `Validade: ${validadeDias} dias\n`;
        message += `Valores sujeitos a analise do aparelho.\n\n`;
        message += `*Arena Tech*`;

        // Generate WhatsApp URL
        const cleanPhone = input.phone.replace(/\D/g, "");
        const phone = cleanPhone.startsWith("55") ? cleanPhone : `55${cleanPhone}`;
        const whatsappUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;

        return { message, whatsappUrl };
      });
    }),
});
