import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, tenantProcedure } from "@/server/api/trpc";
import { isTenantAdmin } from "@/lib/auth/roles";
import { resolveCategoryId } from "@/server/services/financial-category.service";
import { resolveSupplierId } from "@/server/services/financial-supplier.service";
import { generateDueRecurringExpenses } from "@/server/services/recurring-expense.service";

const MAX_CENTS = 1_000_000_00; // R$ 1.000.000

/**
 * Templates de contas RECORRENTES (mensais). Só admin gere (é config financeira).
 * O cron gera as FinancialTransactions; aqui é o CRUD dos templates.
 */
export const recurringExpenseRouter = createTRPCRouter({
  list: tenantProcedure.query(async ({ ctx }) => {
    return ctx.withTenant((tx) =>
      tx.recurringExpense.findMany({ orderBy: [{ active: "desc" }, { dayOfMonth: "asc" }] }),
    );
  }),

  create: tenantProcedure
    .input(
      z.object({
        type: z.enum(["PAYABLE", "RECEIVABLE"]).default("PAYABLE"),
        description: z.string().min(1).max(200),
        amountCents: z.number().int().min(1).max(MAX_CENTS),
        dayOfMonth: z.number().int().min(1).max(28),
        category: z.string().max(100).optional().nullable(),
        supplierId: z.string().uuid().optional().nullable(),
        newSupplierName: z.string().min(1).max(200).optional().nullable(),
        supplier: z.string().max(200).optional().nullable(),
        notes: z.string().max(2000).optional().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!isTenantAdmin(ctx.session, ctx.tenantId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissao" });
      }
      return ctx.withTenant(async (tx) => {
        const categoryName = input.category?.trim() || null;
        const categoryId = await resolveCategoryId(tx, ctx.tenantId, categoryName, input.type);
        const resolvedSupplier =
          input.type === "PAYABLE"
            ? await resolveSupplierId(tx, ctx.tenantId, input)
            : { supplierId: null, supplierName: null };

        return tx.recurringExpense.create({
          data: {
            tenantId: ctx.tenantId,
            type: input.type,
            description: input.description,
            amountCents: input.amountCents,
            dayOfMonth: input.dayOfMonth,
            category: categoryName,
            categoryId,
            supplier: resolvedSupplier.supplierName,
            supplierId: resolvedSupplier.supplierId,
            notes: input.notes ?? null,
            createdByUserId: ctx.session.user.id,
          },
          select: { id: true },
        });
      });
    }),

  update: tenantProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        description: z.string().min(1).max(200),
        amountCents: z.number().int().min(1).max(MAX_CENTS),
        dayOfMonth: z.number().int().min(1).max(28),
        category: z.string().max(100).optional().nullable(),
        supplierId: z.string().uuid().optional().nullable(),
        newSupplierName: z.string().min(1).max(200).optional().nullable(),
        supplier: z.string().max(200).optional().nullable(),
        notes: z.string().max(2000).optional().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!isTenantAdmin(ctx.session, ctx.tenantId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissao" });
      }
      return ctx.withTenant(async (tx) => {
        const existing = await tx.recurringExpense.findUnique({ where: { id: input.id } });
        if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
        const categoryName = input.category?.trim() || null;
        const categoryId = await resolveCategoryId(tx, ctx.tenantId, categoryName, existing.type);
        const resolvedSupplier =
          existing.type === "PAYABLE"
            ? await resolveSupplierId(tx, ctx.tenantId, input)
            : { supplierId: null, supplierName: null };
        await tx.recurringExpense.update({
          where: { id: input.id },
          data: {
            description: input.description,
            amountCents: input.amountCents,
            dayOfMonth: input.dayOfMonth,
            category: categoryName,
            categoryId,
            supplier: resolvedSupplier.supplierName,
            supplierId: resolvedSupplier.supplierId,
            notes: input.notes ?? null,
          },
        });
        return { success: true };
      });
    }),

  toggle: tenantProcedure
    .input(z.object({ id: z.string().uuid(), active: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      if (!isTenantAdmin(ctx.session, ctx.tenantId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissao" });
      }
      return ctx.withTenant(async (tx) => {
        const existing = await tx.recurringExpense.findUnique({ where: { id: input.id } });
        if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
        await tx.recurringExpense.update({ where: { id: input.id }, data: { active: input.active } });
        return { success: true };
      });
    }),

  delete: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      if (!isTenantAdmin(ctx.session, ctx.tenantId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissao" });
      }
      return ctx.withTenant(async (tx) => {
        const existing = await tx.recurringExpense.findUnique({ where: { id: input.id } });
        if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
        // Só apaga o template; as transações já geradas permanecem no financeiro.
        await tx.recurringExpense.delete({ where: { id: input.id } });
        return { success: true };
      });
    }),

  /** Gera manualmente as contas devidas agora (além do cron). Admin. */
  generateNow: tenantProcedure.mutation(async ({ ctx }) => {
    if (!isTenantAdmin(ctx.session, ctx.tenantId)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissao" });
    }
    // O service é cross-tenant (withAdmin); dispara a geração de todos os devidos.
    return generateDueRecurringExpenses(new Date());
  }),
});
