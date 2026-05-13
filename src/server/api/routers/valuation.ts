import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Prisma } from "@prisma/client";
import { createTRPCRouter, tenantProcedure } from "@/server/api/trpc";
import {
  createValuationSchema,
  updateValuationSchema,
  listValuationsSchema,
  bulkAdjustSchema,
  duplicateModelSchema,
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
});
