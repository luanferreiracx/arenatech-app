import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Prisma } from "@prisma/client";
import { createTRPCRouter, tenantProcedure } from "@/server/api/trpc";
import { withAdmin } from "@/server/db";
import {
  createInterestSchema,
  updateInterestSchema,
  listInterestsSchema,
  addInteractionSchema,
  changeInterestStatusSchema,
} from "@/lib/validators/customer";

function decimalToCents(v: Prisma.Decimal | null | undefined): number {
  if (v == null) return 0;
  return Math.round(Number(v) * 100);
}

function serializeInterest(interest: Record<string, unknown>) {
  return {
    ...interest,
    estimatedValue: decimalToCents(interest.estimatedValue as Prisma.Decimal | null),
  };
}

export const interestRouter = createTRPCRouter({
  /** List all interests (global, not just per customer) */
  list: tenantProcedure
    .input(listInterestsSchema)
    .query(async ({ ctx, input }) => {
      const page = input.page ?? 0;
      const pageSize = input.pageSize ?? 20;

      return ctx.withTenant(async (tx) => {
        const where: Prisma.CustomerInterestWhereInput = {
          tenantId: ctx.tenantId,
          deletedAt: null,
        };

        if (input.customerId) {
          where.customerId = input.customerId;
        }

        if (input.status) {
          where.status = input.status;
        }

        if (input.interestType) {
          where.interestType = input.interestType;
        }

        if (input.search?.trim()) {
          const term = input.search.trim();
          where.OR = [
            { description: { contains: term, mode: "insensitive" } },
            { product: { contains: term, mode: "insensitive" } },
            { customer: { name: { contains: term, mode: "insensitive" } } },
            { customer: { phone: { contains: term.replace(/\D/g, "") } } },
          ];
        }

        const [data, total] = await Promise.all([
          tx.customerInterest.findMany({
            where,
            include: {
              customer: {
                select: { id: true, name: true, phone: true, cpf: true },
              },
              _count: { select: { interactions: true } },
            },
            orderBy: { createdAt: "desc" },
            skip: page * pageSize,
            take: pageSize,
          }),
          tx.customerInterest.count({ where }),
        ]);

        return {
          data: data.map((d) => serializeInterest(d as unknown as Record<string, unknown>)),
          total,
          pageCount: Math.ceil(total / pageSize),
        };
      });
    }),

  /** Get interest by ID with interactions */
  getById: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const interest = await tx.customerInterest.findUnique({
          where: { id: input.id },
          include: {
            customer: {
              select: { id: true, name: true, phone: true, cpf: true, email: true },
            },
            interactions: {
              orderBy: { createdAt: "desc" },
            },
          },
        });

        if (!interest || interest.deletedAt) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Interesse nao encontrado" });
        }

        // Fetch user names for interactions
        const userIds = [...new Set(interest.interactions.map((i) => i.userId))];
        let userMap: Record<string, string> = {};
        if (userIds.length > 0) {
          const users = await withAdmin(async (adminTx) => {
            return adminTx.user.findMany({
              where: { id: { in: userIds } },
              select: { id: true, name: true },
            });
          });
          userMap = Object.fromEntries(users.map((u) => [u.id, u.name]));
        }

        // Fetch assigned user name
        let assignedUserName: string | null = null;
        if (interest.assignedUserId) {
          const u = await withAdmin(async (adminTx) =>
            adminTx.user.findUnique({
              where: { id: interest.assignedUserId! },
              select: { name: true },
            })
          );
          assignedUserName = u?.name ?? null;
        }

        return {
          ...serializeInterest(interest as unknown as Record<string, unknown>),
          assignedUserName,
          interactions: interest.interactions.map((i) => ({
            ...i,
            userName: userMap[i.userId] ?? "Sistema",
          })),
        };
      });
    }),

  /** Create interest */
  create: tenantProcedure
    .input(createInterestSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const customer = await tx.customer.findUnique({
          where: { id: input.customerId },
        });
        if (!customer) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Cliente nao encontrado" });
        }

        let followUpAt: Date | null = null;
        if (input.followUpAt?.trim()) {
          followUpAt = new Date(input.followUpAt);
          if (isNaN(followUpAt.getTime())) followUpAt = null;
        }

        const interest = await tx.customerInterest.create({
          data: {
            tenantId: ctx.tenantId,
            customerId: input.customerId,
            description: input.description,
            product: input.product ?? null,
            estimatedValue: input.estimatedValue != null ? new Prisma.Decimal(input.estimatedValue / 100) : null,
            interestType: input.interestType ?? "PURCHASE",
            priority: input.priority ?? "media",
            assignedUserId: input.assignedUserId ?? null,
            notes: input.notes ?? null,
            followUpAt,
          },
        });

        return serializeInterest(interest as unknown as Record<string, unknown>);
      });
    }),

  /** Update interest */
  update: tenantProcedure
    .input(updateInterestSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const existing = await tx.customerInterest.findUnique({
          where: { id: input.id },
        });
        if (!existing || existing.deletedAt) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Interesse nao encontrado" });
        }

        const data: Record<string, unknown> = {};

        if (input.description !== undefined) data.description = input.description;
        if (input.product !== undefined) data.product = input.product;
        if (input.estimatedValue !== undefined) {
          data.estimatedValue = input.estimatedValue != null ? new Prisma.Decimal(input.estimatedValue / 100) : null;
        }
        if (input.interestType !== undefined) data.interestType = input.interestType;
        if (input.priority !== undefined) data.priority = input.priority;
        if (input.status !== undefined) data.status = input.status;
        if (input.assignedUserId !== undefined) data.assignedUserId = input.assignedUserId;
        if (input.notes !== undefined) data.notes = input.notes;
        if (input.resolved !== undefined) data.resolved = input.resolved;
        if (input.statusChangeReason !== undefined) data.statusChangeReason = input.statusChangeReason;

        if (input.followUpAt !== undefined) {
          if (input.followUpAt === null) {
            data.followUpAt = null;
          } else if (input.followUpAt.trim()) {
            const date = new Date(input.followUpAt);
            data.followUpAt = isNaN(date.getTime()) ? null : date;
          }
        }

        const updated = await tx.customerInterest.update({
          where: { id: input.id },
          data,
        });

        return serializeInterest(updated as unknown as Record<string, unknown>);
      });
    }),

  /** Change status with reason */
  changeStatus: tenantProcedure
    .input(changeInterestStatusSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const existing = await tx.customerInterest.findUnique({
          where: { id: input.id },
        });
        if (!existing || existing.deletedAt) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Interesse nao encontrado" });
        }

        const updated = await tx.customerInterest.update({
          where: { id: input.id },
          data: {
            status: input.status,
            statusChangeReason: input.reason,
            resolved: input.status === "FINISHED" || input.status === "CANCELLED",
          },
        });

        // Create interaction to record the status change
        await tx.interestInteraction.create({
          data: {
            tenantId: ctx.tenantId,
            interestId: input.id,
            interactionType: "Mudanca de Status",
            description: `Status alterado para ${input.status}. Motivo: ${input.reason}`,
            userId: ctx.session.user.id,
          },
        });

        return serializeInterest(updated as unknown as Record<string, unknown>);
      });
    }),

  /** Add interaction */
  addInteraction: tenantProcedure
    .input(addInteractionSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const interest = await tx.customerInterest.findUnique({
          where: { id: input.interestId },
        });
        if (!interest || interest.deletedAt) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Interesse nao encontrado" });
        }

        // If first interaction and status is WAITING, auto-update to CONTACTED
        if (interest.status === "WAITING") {
          await tx.customerInterest.update({
            where: { id: input.interestId },
            data: { status: "CONTACTED" },
          });
        }

        return tx.interestInteraction.create({
          data: {
            tenantId: ctx.tenantId,
            interestId: input.interestId,
            interactionType: input.interactionType,
            description: input.description,
            userId: ctx.session.user.id,
          },
        });
      });
    }),

  /** Delete interest (soft delete) */
  delete: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const existing = await tx.customerInterest.findUnique({
          where: { id: input.id },
        });
        if (!existing || existing.deletedAt) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Interesse nao encontrado" });
        }

        await tx.customerInterest.update({
          where: { id: input.id },
          data: { deletedAt: new Date() },
        });

        return { success: true };
      });
    }),

  /** Stats for interests dashboard */
  stats: tenantProcedure.query(async ({ ctx }) => {
    return ctx.withTenant(async (tx) => {
      const where = { tenantId: ctx.tenantId, deletedAt: null as Date | null };
      const [total, waiting, contacted, finished, cancelled] = await Promise.all([
        tx.customerInterest.count({ where }),
        tx.customerInterest.count({ where: { ...where, status: "WAITING" } }),
        tx.customerInterest.count({ where: { ...where, status: "CONTACTED" } }),
        tx.customerInterest.count({ where: { ...where, status: "FINISHED" } }),
        tx.customerInterest.count({ where: { ...where, status: "CANCELLED" } }),
      ]);

      return { total, waiting, contacted, finished, cancelled };
    });
  }),
});
