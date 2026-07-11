import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, tenantProcedure } from "@/server/api/trpc";
import { isTenantAdmin } from "@/lib/auth/roles";
import {
  createInterestSchema,
  updateInterestStatusSchema,
  listInterestsSchema,
  addInteractionSchema,
  sendBatchSchema,
  isTerminalInterestStatus,
  normalizePhoneDigits,
} from "@/lib/validators/customer";
import { logger } from "@/lib/logger";
import { sendTextMessage } from "@/lib/services/whatsapp-service";

export const interestRouter = createTRPCRouter({
  // SPEC 4.5: List interests with filters and stats
  list: tenantProcedure
    .input(listInterestsSchema)
    .query(async ({ ctx, input }) => {
      const page = input.page ?? 0;
      const pageSize = input.pageSize ?? 20; // SPEC: 20 per page

      return ctx.withTenant(async (tx) => {
        const where: Record<string, unknown> = {};

        if (input.status) {
          where.status = input.status;
        }

        if (input.type) {
          where.type = input.type;
        }

        // SPEC 4.5: search by name, phone, model
        if (input.search && input.search.trim()) {
          const term = input.search.trim();
          // B6: telefone é armazenado só-dígitos; se o termo tiver dígitos,
          // busca por eles (a máscara digitada pelo operador não atrapalha).
          const digits = normalizePhoneDigits(term);
          where.OR = [
            { customerName: { contains: term, mode: "insensitive" } },
            { desiredModel: { contains: term, mode: "insensitive" } },
            ...(digits ? [{ phone: { contains: digits } }] : []),
          ];
        }

        // B7 (auditoria interesses 2026-07-11): os cards de stats contavam o
        // tenant INTEIRO, ignorando o filtro ativo (status/tipo/busca) → número
        // "Total: 300" com a tabela mostrando 3 linhas confundia o operador.
        // Agora as stats refletem o mesmo `where` da listagem. `status` sai do
        // where de cada contagem por status (senão o filtro de status zeraria
        // as outras faixas).
        const { status: _statusFilter, ...whereNoStatus } = where;

        const [data, total, stats] = await Promise.all([
          tx.interest.findMany({
            where,
            include: {
              interactions: {
                orderBy: { occurredAt: "desc" },
                take: 5,
              },
            },
            orderBy: { createdAt: "desc" },
            skip: page * pageSize,
            take: pageSize,
          }),
          tx.interest.count({ where }),
          // SPEC 4.5: stats cards — respeitam tipo/busca; cada faixa fixa o status.
          Promise.all([
            tx.interest.count({ where: whereNoStatus }),
            tx.interest.count({ where: { ...whereNoStatus, status: "WAITING" } }),
            tx.interest.count({ where: { ...whereNoStatus, status: "CONTACTED" } }),
            tx.interest.count({ where: { ...whereNoStatus, status: "COMPLETED" } }),
            tx.interest.count({ where: { ...whereNoStatus, status: "CANCELLED" } }),
          ]).then(([total, waiting, contacted, completed, cancelled]) => ({
            total,
            waiting,
            contacted,
            completed,
            cancelled,
          })),
        ]);

        return {
          data,
          total,
          pageCount: Math.ceil(total / pageSize),
          stats,
        };
      });
    }),

  // Get interest by ID with interactions
  byId: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const interest = await tx.interest.findUnique({
          where: { id: input.id },
          include: {
            interactions: {
              orderBy: { occurredAt: "desc" },
            },
          },
        });

        if (!interest) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Interesse não encontrado" });
        }

        return interest;
      });
    }),

  // SPEC Fluxo 5: Create interest (RN-8: status=WAITING)
  create: tenantProcedure
    .input(createInterestSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const interest = await tx.interest.create({
          data: {
            tenantId: ctx.tenantId,
            customerName: input.customerName,
            // B6: telefone armazenado só-dígitos (chave estável de busca).
            phone: normalizePhoneDigits(input.phone),
            cpf: input.cpf || null,
            email: input.email || null,
            type: input.type,
            desiredModel: input.desiredModel,
            notes: input.notes || null,
            status: "WAITING", // RN-8
            createdById: ctx.session.user.id,
          },
        });

        return interest;
      });
    }),

  // SPEC 5 RN-9: Update status
  updateStatus: tenantProcedure
    .input(updateInterestStatusSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const interest = await tx.interest.findUnique({
          where: { id: input.id },
        });

        if (!interest) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Interesse não encontrado" });
        }

        // B4 (auditoria interesses 2026-07-11): estados terminais não voltam.
        // COMPLETED/CANCELLED reabertos corrompiam o funil e as métricas.
        // Decisão do dono: para retomar, cadastra-se um interesse novo.
        if (
          isTerminalInterestStatus(interest.status) &&
          interest.status !== input.status
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Interesse finalizado ou cancelado não muda de status. Cadastre um novo interesse para retomar.",
          });
        }

        await tx.interest.update({
          where: { id: input.id },
          data: { status: input.status },
        });

        return { success: true };
      });
    }),

  // SPEC Fluxo 6: Add interaction (RN-9: WAITING → CONTACTED)
  addInteraction: tenantProcedure
    .input(addInteractionSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const interest = await tx.interest.findUnique({
          where: { id: input.interestId },
        });

        if (!interest) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Interesse não encontrado" });
        }

        const interaction = await tx.interestInteraction.create({
          data: {
            tenantId: ctx.tenantId,
            interestId: input.interestId,
            userId: ctx.session.user.id,
            type: input.type,
            description: input.description,
          },
        });

        // SPEC RN-9: auto-advance WAITING → CONTACTED
        if (interest.status === "WAITING") {
          await tx.interest.update({
            where: { id: input.interestId },
            data: { status: "CONTACTED" },
          });
        }

        return interaction;
      });
    }),

  // SPEC RN-14: Delete interaction (own or manager/owner)
  deleteInteraction: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const interaction = await tx.interestInteraction.findUnique({
          where: { id: input.id },
        });

        if (!interaction) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Interação não encontrada" });
        }

        // SPEC RN-14: só o criador ou um admin do tenant
        const isCreator = interaction.userId === ctx.session.user.id;

        if (!isCreator && !isTenantAdmin(ctx.session, ctx.tenantId)) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Você não tem permissão para excluir esta interação",
          });
        }

        await tx.interestInteraction.delete({
          where: { id: input.id },
        });

        return { success: true };
      });
    }),

  // SPEC RN-13: Delete interest (manager/owner, hard delete with cascade)
  delete: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      if (!isTenantAdmin(ctx.session, ctx.tenantId)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Apenas administradores do tenant podem excluir interesses",
        });
      }

      return ctx.withTenant(async (tx) => {
        const interest = await tx.interest.findUnique({
          where: { id: input.id },
        });

        if (!interest) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Interesse não encontrado" });
        }

        // Cascade: interactions deleted by DB ON DELETE CASCADE
        await tx.interest.delete({
          where: { id: input.id },
        });

        return { success: true };
      });
    }),

  // SPEC Fluxo 7: Send WhatsApp batch (RN-10, RN-11, RN-12)
  // Integra com communicationRouter / whatsapp-service real.
  sendBatch: tenantProcedure
    .input(sendBatchSchema)
    .mutation(async ({ ctx, input }) => {
      // gap In1: ANTES, o loop de N envios HTTP rodava DENTRO de uma unica tx.
      // Com N destinatarios x ~2s por envio, a tx ficava aberta segundos a fio
      // e segurava a conexao Postgres todo esse tempo — exauria o pool. (O lote
      // e limitado a 5 destinatarios pelo sendBatchSchema.)
      //
      // Agora cada interesse roda em microtransacoes separadas e o HTTP
      // fica fora delas: tx1 cria Message PENDING + retorna ID, HTTP, tx2
      // atualiza status + (se sucesso) cria interaction + atualiza status
      // do interest.

      // tx1: carrega todos os interesses (rapido).
      const interests = await ctx.withTenant(async (tx) =>
        tx.interest.findMany({ where: { id: { in: input.ids } } }),
      );

      let sent = 0;
      let errors = 0;

      for (const interest of interests) {
        if (!interest.phone) {
          errors++;
          logger.warn("Interest sem telefone", { interestId: interest.id });
          continue;
        }
        try {
          // tx1-per-interest: cria Message PENDING.
          const messageId = await ctx.withTenant(async (tx) => {
            const m = await tx.message.create({
              data: {
                tenantId: ctx.tenantId,
                channel: "WHATSAPP",
                direction: "OUTBOUND",
                status: "PENDING",
                recipientPhone: interest.phone,
                recipientName: interest.customerName,
                body: input.message,
                referenceId: interest.id,
                referenceType: "interest",
                createdById: ctx.session.user.id,
              },
            });
            return m.id;
          });

          // HTTP fora da tx.
          const result = await sendTextMessage(interest.phone, input.message);

          // tx2-per-interest: aplica resultado + (se sucesso) interaction + status.
          await ctx.withTenant(async (tx) => {
            await tx.message.update({
              where: { id: messageId },
              data: {
                status: result.success ? "SENT" : "FAILED",
                providerMessageId: result.messageId ?? null,
                errorMessage: result.error ?? null,
                sentAt: result.success ? new Date() : null,
              },
            });

            if (result.success) {
              await tx.interestInteraction.create({
                data: {
                  tenantId: ctx.tenantId,
                  interestId: interest.id,
                  userId: ctx.session.user.id,
                  type: "WHATSAPP",
                  description: `Mensagem enviada em lote: ${input.message.substring(0, 100)}`,
                },
              });

              await tx.interest.update({
                where: { id: interest.id },
                data: {
                  status: interest.status === "WAITING" ? "CONTACTED" : interest.status,
                  lastNotifiedAt: new Date(),
                },
              });
            }
          });

          if (result.success) sent++;
          else errors++;
        } catch (e) {
          logger.error("WhatsApp batch send failed", {
            interestId: interest.id,
            error: e instanceof Error ? e.message : String(e),
          });
          errors++;
        }
      }

      return { sent, errors };
    }),

  /**
   * Marca interesse como convertido em venda ou OS.
   * Usado quando um cliente que tinha interesse efetivamente comprou/contratou.
   */
  markConverted: tenantProcedure
    .input(z.object({
      id: z.string().uuid(),
      saleId: z.string().uuid().optional(),
      osId: z.string().uuid().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!input.saleId && !input.osId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Forneca saleId ou osId" });
      }
      return ctx.withTenant(async (tx) => {
        return tx.interest.update({
          where: { id: input.id },
          data: {
            status: "COMPLETED",
            convertedAt: new Date(),
            convertedToSaleId: input.saleId ?? null,
            convertedToOsId: input.osId ?? null,
          },
        });
      });
    }),

  /**
   * Stats agregadas com taxa de conversao e aging por status.
   */
  conversionStats: tenantProcedure
    .input(z.object({ from: z.string().optional(), to: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const where: Record<string, unknown> = {};
        if (input?.from || input?.to) {
          const range: Record<string, Date> = {};
          if (input.from) range.gte = new Date(input.from);
          if (input.to) range.lte = new Date(input.to);
          where.createdAt = range;
        }
        const [total, completed, converted, byStatus] = await Promise.all([
          tx.interest.count({ where }),
          tx.interest.count({ where: { ...where, status: "COMPLETED" } }),
          tx.interest.count({ where: { ...where, convertedAt: { not: null } } }),
          tx.interest.groupBy({
            by: ["status"],
            where,
            _count: true,
          }),
        ]);
        const conversionRate = total > 0 ? Math.round((converted / total) * 100) : 0;
        return {
          total,
          completed,
          converted,
          conversionRate,
          byStatus: byStatus.map((b) => ({ status: b.status, count: b._count })),
        };
      });
    }),
});
