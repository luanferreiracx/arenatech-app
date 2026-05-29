import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Prisma } from "@prisma/client";
import { createTRPCRouter, tenantProcedure } from "@/server/api/trpc";
import { queryImeiSchema, listImeiQueriesSchema, validateNfeSchema } from "@/lib/validators/imei";
import { queryDevice } from "@/lib/services/imei-service";
import { validateNfe } from "@/lib/services/nfe-danfe-service";
import { logger } from "@/lib/logger";

export const imeiRouter = createTRPCRouter({
  /** Query IMEI from external service */
  query: tenantProcedure
    .input(queryImeiSchema)
    .mutation(async ({ ctx, input }) => {
      const now = new Date();
      const periodMonth = now.getMonth() + 1;
      const periodYear = now.getFullYear();
      const userId = ctx.session.user.id;

      // ── 1) Reserva atomica de slot (corrige race condition) ──
      // Antes: read-then-increment permitia que N requests concorrentes
      // passassem o `if (usedCount < limit)` simultaneamente e estourassem
      // a quota. Agora `UPDATE ... WHERE used_count < monthly_limit` e
      // atomico no Postgres: se 0 linhas afetadas, quota esgotou.
      const reservation = await ctx.withTenant(async (tx) => {
        // Garante que o registro de quota exista (idempotente).
        await tx.imeiQuota.upsert({
          where: {
            tenantId_periodMonth_periodYear: {
              tenantId: ctx.tenantId,
              periodMonth,
              periodYear,
            },
          },
          create: {
            tenantId: ctx.tenantId,
            monthlyLimit: 50,
            usedCount: 0,
            periodMonth,
            periodYear,
          },
          update: {},
        });

        // UPDATE atomico com condicao em outra coluna — Prisma nao expoe
        // isso via API de model; usamos $executeRaw com bind seguro.
        const updatedRows = await tx.$executeRaw`
          UPDATE imei_quotas
          SET used_count = used_count + 1, updated_at = NOW()
          WHERE tenant_id = ${ctx.tenantId}::uuid
            AND period_month = ${periodMonth}
            AND period_year = ${periodYear}
            AND used_count < monthly_limit
        `;

        if (updatedRows === 0) {
          const q = await tx.imeiQuota.findUnique({
            where: {
              tenantId_periodMonth_periodYear: {
                tenantId: ctx.tenantId,
                periodMonth,
                periodYear,
              },
            },
            select: { monthlyLimit: true },
          });
          return { reserved: false as const, limit: q?.monthlyLimit ?? 50 };
        }
        return { reserved: true as const };
      });

      if (!reservation.reserved) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cota mensal de consultas IMEI atingida (${reservation.limit}). Contate o administrador.`,
        });
      }

      // ── 2) Chamada HTTP fora da tx (gap Ix11 — http-inside-tx) ──
      let result: Awaited<ReturnType<typeof queryDevice>>;
      try {
        result = await queryDevice(input.identificador);
      } catch (error) {
        // Falha de rede / 5xx: libera o slot reservado (best-effort).
        // Sem isso, falhas transientes ficam consumindo quota.
        await ctx.withTenant(async (tx) => {
          await tx.imeiQuota.updateMany({
            where: { tenantId: ctx.tenantId, periodMonth, periodYear },
            data: { usedCount: { decrement: 1 } },
          });
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

      // Consulta logica falhou (API respondeu mas status != success): libera o
      // slot — nao faz sentido cobrar cota por consulta que nao retornou dados.
      if (!result.success) {
        await ctx.withTenant(async (tx) => {
          await tx.imeiQuota.updateMany({
            where: { tenantId: ctx.tenantId, periodMonth, periodYear },
            data: { usedCount: { decrement: 1 } },
          });
        }).catch(() => undefined);
      }

      // ── 3) Salva o registro de consulta ──
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
