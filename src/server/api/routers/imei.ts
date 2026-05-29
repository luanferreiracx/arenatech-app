import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Prisma } from "@prisma/client";
import { createTRPCRouter, tenantProcedure } from "@/server/api/trpc";
import { queryImeiSchema, listImeiQueriesSchema, validateNfeSchema } from "@/lib/validators/imei";
import { queryDevice } from "@/lib/services/imei-service";
import { validateNfe } from "@/lib/services/nfe-danfe-service";
import { logger } from "@/lib/logger";

export const imeiRouter = createTRPCRouter({
  /** Query IMEI/Serial from external service (CheckIMEI). Sem cota — gratuito. */
  query: tenantProcedure
    .input(queryImeiSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Chamada HTTP fora de qualquer tx.
      let result: Awaited<ReturnType<typeof queryDevice>>;
      try {
        result = await queryDevice(input.identificador);
      } catch (error) {
        await ctx.withTenant(async (tx) => {
          await tx.imeiQuery.create({
            data: {
              tenantId: ctx.tenantId,
              userId,
              imei: input.identificador,
              status: "error",
              errorMessage: error instanceof Error ? error.message : "Erro desconhecido",
            },
          });
        }).catch(() => undefined);

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Erro ao consultar IMEI",
        });
      }

      // Salva o registro de consulta (historico).
      const queryRecord = await ctx.withTenant(async (tx) =>
        tx.imeiQuery.create({
          data: {
            tenantId: ctx.tenantId,
            userId,
            imei: input.identificador,
            result: result as unknown as Prisma.InputJsonValue,
            status: result.success ? "success" : "error",
            errorMessage: result.error ?? null,
          },
        }),
      );

      logger.info("IMEI query", {
        identificador: input.identificador,
        success: result.success,
        userId,
      });

      return {
        id: queryRecord.id,
        ...result,
      };
    }),

  /** Consulta/validacao de NF-e por chave de acesso (baixa o DANFE PDF). Gratuito. */
  validateNfe: tenantProcedure
    .input(validateNfeSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await validateNfe(input.chave);
      logger.info("NFe validate", {
        chave: input.chave,
        success: result.success,
        userId: ctx.session.user.id,
      });
      return result;
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
