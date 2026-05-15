import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, tenantProcedure } from "@/server/api/trpc";
import {
  createInterestSchema,
  updateInterestStatusSchema,
  listInterestsSchema,
  addInteractionSchema,
  sendBatchSchema,
} from "@/lib/validators/customer";
import { logger } from "@/lib/logger";

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
          where.OR = [
            { customerName: { contains: term, mode: "insensitive" } },
            { phone: { contains: term } },
            { desiredModel: { contains: term, mode: "insensitive" } },
          ];
        }

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
          // SPEC 4.5: stats cards
          Promise.all([
            tx.interest.count(),
            tx.interest.count({ where: { status: "WAITING" } }),
            tx.interest.count({ where: { status: "CONTACTED" } }),
            tx.interest.count({ where: { status: "COMPLETED" } }),
            tx.interest.count({ where: { status: "CANCELLED" } }),
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
            phone: input.phone,
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

        // SPEC RN-14: only creator or manager/owner
        const userRole = ctx.session.availableTenants.find((t) => t.id === ctx.tenantId)?.role;
        const isOwnerOrManager = userRole && ["manager", "owner", "admin"].includes(userRole);
        const isCreator = interaction.userId === ctx.session.user.id;

        if (!isCreator && !isOwnerOrManager) {
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
      const userRole = ctx.session.availableTenants.find((t) => t.id === ctx.tenantId)?.role;
      if (!userRole || !["manager", "owner", "admin"].includes(userRole)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Apenas gerentes e proprietários podem excluir interesses",
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
  sendBatch: tenantProcedure
    .input(sendBatchSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const interests = await tx.interest.findMany({
          where: { id: { in: input.ids } },
        });

        let sent = 0;
        let errors = 0;

        for (const interest of interests) {
          try {
            // TODO: Replace with real CommunicationService.sendBatch when module is specified
            // Stub: log and count as success
            logger.info("WhatsApp batch stub", {
              tenantId: ctx.tenantId,
              interestId: interest.id,
              phone: interest.phone,
              message: input.message,
            });

            // SPEC RN-12: create interaction for each successful send
            await tx.interestInteraction.create({
              data: {
                tenantId: ctx.tenantId,
                interestId: interest.id,
                userId: ctx.session.user.id,
                type: "WHATSAPP",
                description: `Mensagem enviada em lote: ${input.message.substring(0, 100)}`,
              },
            });

            // SPEC RN-10: WAITING → CONTACTED
            if (interest.status === "WAITING") {
              await tx.interest.update({
                where: { id: interest.id },
                data: { status: "CONTACTED" },
              });
            }

            sent++;
          } catch (e) {
            logger.error("WhatsApp batch send failed", {
              interestId: interest.id,
              error: e instanceof Error ? e.message : String(e),
            });
            errors++;
          }
        }

        return { sent, errors };
      });
    }),
});
