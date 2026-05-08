import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, tenantProcedure } from "@/server/api/trpc";
import { queryImeiSchema, listImeiQueriesSchema } from "@/lib/validators/imei";
import { queryImei } from "@/lib/services/imei-service";

export const imeiRouter = createTRPCRouter({
  // ── Query IMEI ────────────────────────────────────────────────────────────

  query: tenantProcedure
    .input(queryImeiSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const now = new Date();
      const periodMonth = now.getMonth() + 1;
      const periodYear = now.getFullYear();

      return ctx.withTenant(async (tx) => {
        // Check/create quota
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
              periodMonth,
              periodYear,
              monthlyLimit: 50,
              usedCount: 0,
            },
          });
        }

        if (quota.usedCount >= quota.monthlyLimit) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Limite de consultas atingido (${quota.monthlyLimit}/mês). Contate o administrador.`,
          });
        }

        // Create query record
        const queryRecord = await tx.imeiQuery.create({
          data: {
            tenantId: ctx.tenantId,
            userId,
            imei: input.imei,
            status: "pending",
          },
        });

        try {
          const result = await queryImei(input.imei);

          // Update query with result
          const updated = await tx.imeiQuery.update({
            where: { id: queryRecord.id },
            data: {
              result: JSON.parse(JSON.stringify(result)),
              status: "success",
            },
          });

          // Increment quota
          await tx.imeiQuota.update({
            where: { id: quota.id },
            data: { usedCount: { increment: 1 } },
          });

          return updated;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";

          await tx.imeiQuery.update({
            where: { id: queryRecord.id },
            data: {
              status: "error",
              errorMessage,
            },
          });

          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Erro ao consultar IMEI: ${errorMessage}`,
          });
        }
      });
    }),

  // ── History ───────────────────────────────────────────────────────────────

  history: tenantProcedure
    .input(listImeiQueriesSchema)
    .query(async ({ ctx, input }) => {
      const { search, status, page, pageSize } = input;
      const skip = page * pageSize;

      return ctx.withTenant(async (tx) => {
        const where = {
          ...(status ? { status } : {}),
          ...(search
            ? {
                imei: { contains: search },
              }
            : {}),
        };

        const [items, total] = await Promise.all([
          tx.imeiQuery.findMany({
            where,
            skip,
            take: pageSize,
            orderBy: { createdAt: "desc" },
          }),
          tx.imeiQuery.count({ where }),
        ]);

        return { items, total, pageCount: Math.ceil(total / pageSize) };
      });
    }),

  // ── Get Quota ─────────────────────────────────────────────────────────────

  getQuota: tenantProcedure.query(async ({ ctx }) => {
    const now = new Date();
    const periodMonth = now.getMonth() + 1;
    const periodYear = now.getFullYear();

    return ctx.withTenant(async (tx) => {
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
        used: quota?.usedCount ?? 0,
        limit: quota?.monthlyLimit ?? 50,
        periodMonth,
        periodYear,
      };
    });
  }),

  // ── Get By ID ─────────────────────────────────────────────────────────────

  getById: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const query = await tx.imeiQuery.findFirst({
          where: { id: input.id },
        });

        if (!query) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Consulta não encontrada" });
        }

        return query;
      });
    }),
});
