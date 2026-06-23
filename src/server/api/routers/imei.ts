import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Prisma } from "@prisma/client";
import { createTRPCRouter, tenantProcedure } from "@/server/api/trpc";
import { withAdmin } from "@/server/db";
import { queryImeiSchema, listImeiQueriesSchema, validateNfeSchema } from "@/lib/validators/imei";
import { queryDevice } from "@/lib/services/imei-service";
import { validateNfe } from "@/lib/services/nfe-danfe-service";
import { logger } from "@/lib/logger";

export const imeiRouter = createTRPCRouter({
  /**
   * Query IMEI/Serial from external service (CheckIMEI). Enforça a cota mensal
   * do plano (ImeiQuota) — cada consulta custa no provedor externo, então o
   * limite do plano é consumido de forma atômica ANTES da chamada. Consulta com
   * erro de rede é estornada (não conta); "não encontrado" conta (o provedor foi
   * consultado). Cobrança de addons (consultas extras) é feature futura.
   */
  query: tenantProcedure
    .input(queryImeiSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const now = new Date();
      const periodMonth = now.getMonth() + 1;
      const periodYear = now.getFullYear();

      // Limite do plano (tabela global → withAdmin). Fallback: default do modelo (50).
      const tenant = await withAdmin((adminTx) =>
        adminTx.tenant.findUnique({ where: { id: ctx.tenantId }, select: { plan: true } }),
      );
      let planMax = 0;
      if (tenant?.plan) {
        const plan = await withAdmin((adminTx) =>
          adminTx.plan.findFirst({
            where: { OR: [{ id: tenant.plan! }, { slug: tenant.plan! }] },
            select: { maxImeiQueries: true },
          }),
        );
        planMax = plan?.maxImeiQueries ?? 0;
      }
      const seedLimit = planMax > 0 ? planMax : 50;

      // Consome a cota do mês de forma ATÔMICA antes da chamada externa: garante a
      // linha do período e incrementa só se used_count < monthly_limit (CAS via SQL).
      await ctx.withTenant(async (tx) => {
        await tx.imeiQuota.upsert({
          where: {
            tenantId_periodMonth_periodYear: { tenantId: ctx.tenantId, periodMonth, periodYear },
          },
          create: { tenantId: ctx.tenantId, periodMonth, periodYear, monthlyLimit: seedLimit, usedCount: 0 },
          update: {},
        });
        const consumed = await tx.$executeRaw`
          UPDATE imei_quotas
          SET used_count = used_count + 1, updated_at = now()
          WHERE tenant_id = ${ctx.tenantId}::uuid
            AND period_month = ${periodMonth}
            AND period_year = ${periodYear}
            AND used_count < monthly_limit
        `;
        if (consumed !== 1) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Limite mensal de consultas IMEI atingido. Contate o suporte para ampliar o plano.",
          });
        }
      });

      // Chamada HTTP fora de qualquer tx.
      let result: Awaited<ReturnType<typeof queryDevice>>;
      try {
        result = await queryDevice(input.identificador);
      } catch (error) {
        // Estorna a cota — a consulta externa falhou (erro de rede), o tenant não
        // recebeu resultado. "Não encontrado" (result.success=false) NÃO estorna.
        await ctx.withTenant(async (tx) => {
          await tx.$executeRaw`
            UPDATE imei_quotas
            SET used_count = GREATEST(used_count - 1, 0), updated_at = now()
            WHERE tenant_id = ${ctx.tenantId}::uuid
              AND period_month = ${periodMonth}
              AND period_year = ${periodYear}
          `;
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
