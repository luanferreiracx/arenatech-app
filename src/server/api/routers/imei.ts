import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Prisma } from "@prisma/client";
import { createTRPCRouter, tenantProcedure } from "@/server/api/trpc";
import { queryImeiSchema, listImeiQueriesSchema } from "@/lib/validators/imei";
import { queryImei as queryImeiService } from "@/lib/services/imei-service";
import { logger } from "@/lib/logger";

export const imeiRouter = createTRPCRouter({
  /** Query IMEI from external service */
  query: tenantProcedure
    .input(queryImeiSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        // Check/create quota for current month
        const now = new Date();
        const periodMonth = now.getMonth() + 1;
        const periodYear = now.getFullYear();

        let quota = await tx.imeiQuota.findUnique({
          where: {
            tenantId_periodMonth_periodYear: {
              tenantId: ctx.tenantId,
              periodMonth,
              periodYear,
            },
          },
        });

        if (!quota) {
          quota = await tx.imeiQuota.create({
            data: {
              tenantId: ctx.tenantId,
              monthlyLimit: 50,
              usedCount: 0,
              periodMonth,
              periodYear,
            },
          });
        }

        if (quota.usedCount >= quota.monthlyLimit) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Cota mensal de consultas IMEI atingida (${quota.monthlyLimit}). Contate o administrador.`,
          });
        }

        try {
          const result = await queryImeiService(input.imei);

          // Save query record
          const queryRecord = await tx.imeiQuery.create({
            data: {
              tenantId: ctx.tenantId,
              userId: ctx.session.user.id,
              imei: input.imei,
              result: result as unknown as Prisma.InputJsonValue,
              status: result.valid ? "success" : "error",
              errorMessage: result.error ?? null,
            },
          });

          // Increment quota
          await tx.imeiQuota.update({
            where: { id: quota.id },
            data: { usedCount: { increment: 1 } },
          });

          logger.info("IMEI query", {
            imei: input.imei,
            valid: result.valid,
            userId: ctx.session.user.id,
          });

          return {
            id: queryRecord.id,
            ...result,
          };
        } catch (error) {
          // Save failed query
          await tx.imeiQuery.create({
            data: {
              tenantId: ctx.tenantId,
              userId: ctx.session.user.id,
              imei: input.imei,
              status: "error",
              errorMessage: error instanceof Error ? error.message : "Erro desconhecido",
            },
          });

          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: error instanceof Error ? error.message : "Erro ao consultar IMEI",
          });
        }
      });
    }),

  /** List query history */
  history: tenantProcedure
    .input(listImeiQueriesSchema)
    .query(async ({ ctx, input }) => {
      const page = input.page ?? 0;
      const pageSize = input.pageSize ?? 20;

      return ctx.withTenant(async (tx) => {
        const where: Record<string, unknown> = {};
        if (input.search) {
          where.imei = { contains: input.search };
        }

        const [data, total] = await Promise.all([
          tx.imeiQuery.findMany({
            where,
            orderBy: { createdAt: "desc" },
            skip: page * pageSize,
            take: pageSize,
          }),
          tx.imeiQuery.count({ where }),
        ]);

        return {
          data,
          total,
          pageCount: Math.ceil(total / pageSize),
        };
      });
    }),

  /** Get current month's quota */
  getQuota: tenantProcedure.query(async ({ ctx }) => {
    return ctx.withTenant(async (tx) => {
      const now = new Date();
      const periodMonth = now.getMonth() + 1;
      const periodYear = now.getFullYear();

      const quota = await tx.imeiQuota.findUnique({
        where: {
          tenantId_periodMonth_periodYear: {
            tenantId: ctx.tenantId,
            periodMonth,
            periodYear,
          },
        },
      });

      return {
        monthlyLimit: quota?.monthlyLimit ?? 50,
        usedCount: quota?.usedCount ?? 0,
        remaining: (quota?.monthlyLimit ?? 50) - (quota?.usedCount ?? 0),
        periodMonth,
        periodYear,
      };
    });
  }),

  /** Get a specific query by ID */
  getById: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const query = await tx.imeiQuery.findUnique({ where: { id: input.id } });
        if (!query) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Consulta nao encontrada" });
        }
        return query;
      });
    }),
});
