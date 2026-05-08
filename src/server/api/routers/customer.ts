import { z } from "zod";
import { createTRPCRouter, tenantProcedure } from "@/server/api/trpc";
import {
  createCustomerSchema,
  updateCustomerSchema,
  listCustomersSchema,
  createInterestSchema,
  updateInterestSchema,
} from "@/lib/validators/customer";

export const customerRouter = createTRPCRouter({
  // ── List ──────────────────────────────────────────────────────────────────

  list: tenantProcedure
    .input(listCustomersSchema)
    .query(async ({ ctx, input }) => {
      const { search, type, page, pageSize, includeDeleted } = input;
      const skip = page * pageSize;

      return ctx.withTenant(async (tx) => {
        const where = {
          ...(includeDeleted ? {} : { deletedAt: null }),
          ...(type ? { type } : {}),
          ...(search
            ? {
                OR: [
                  { name: { contains: search, mode: "insensitive" as const } },
                  { cpf: { contains: search, mode: "insensitive" as const } },
                  { cnpj: { contains: search, mode: "insensitive" as const } },
                  { phone: { contains: search, mode: "insensitive" as const } },
                ],
              }
            : {}),
        };

        const [items, total] = await Promise.all([
          tx.customer.findMany({
            where,
            skip,
            take: pageSize,
            orderBy: { name: "asc" },
          }),
          tx.customer.count({ where }),
        ]);

        return { items, total, pageCount: Math.ceil(total / pageSize) };
      });
    }),

  // ── ById ──────────────────────────────────────────────────────────────────

  byId: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        return tx.customer.findFirst({
          where: { id: input.id },
          include: { interests: { orderBy: { createdAt: "desc" } } },
        });
      });
    }),

  // ── Create ────────────────────────────────────────────────────────────────

  create: tenantProcedure
    .input(createCustomerSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        return tx.customer.create({
          data: { tenantId: ctx.tenantId, ...input },
        });
      });
    }),

  // ── Update ────────────────────────────────────────────────────────────────

  update: tenantProcedure
    .input(updateCustomerSchema.extend({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.withTenant(async (tx) => {
        return tx.customer.update({ where: { id }, data });
      });
    }),

  // ── Delete (soft) ─────────────────────────────────────────────────────────

  delete: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        return tx.customer.update({
          where: { id: input.id },
          data: { deletedAt: new Date() },
        });
      });
    }),

  // ── Restore ───────────────────────────────────────────────────────────────

  restore: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        return tx.customer.update({
          where: { id: input.id },
          data: { deletedAt: null },
        });
      });
    }),

  // ── Interests ─────────────────────────────────────────────────────────────

  listInterests: tenantProcedure
    .input(z.object({ customerId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        return tx.customerInterest.findMany({
          where: { customerId: input.customerId },
          orderBy: { createdAt: "desc" },
        });
      });
    }),

  createInterest: tenantProcedure
    .input(createInterestSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        return tx.customerInterest.create({
          data: { tenantId: ctx.tenantId, ...input },
        });
      });
    }),

  updateInterest: tenantProcedure
    .input(updateInterestSchema.extend({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.withTenant(async (tx) => {
        return tx.customerInterest.update({ where: { id }, data });
      });
    }),

  deleteInterest: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        return tx.customerInterest.delete({ where: { id: input.id } });
      });
    }),
});
