import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, tenantProcedure } from "@/server/api/trpc";
import {
  openCashRegisterSchema,
  closeCashRegisterSchema,
  addCashMovementSchema,
  listCashHistorySchema,
} from "@/lib/validators/cashier";

export const cashierRouter = createTRPCRouter({
  // ── Get Current (open) ──────────────────────────────────────────────────────

  getCurrent: tenantProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    return ctx.withTenant(async (tx) => {
      return tx.cashRegister.findFirst({
        where: { userId, status: "OPEN" },
        include: { movements: { orderBy: { createdAt: "desc" } } },
      });
    });
  }),

  // ── Open ────────────────────────────────────────────────────────────────────

  open: tenantProcedure
    .input(openCashRegisterSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      return ctx.withTenant(async (tx) => {
        // Only 1 open cash register per user
        const existing = await tx.cashRegister.findFirst({
          where: { userId, status: "OPEN" },
        });
        if (existing) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Já existe um caixa aberto para este usuário",
          });
        }

        return tx.cashRegister.create({
          data: {
            tenantId: ctx.tenantId,
            userId,
            openingBalance: input.openingBalance,
            status: "OPEN",
          },
        });
      });
    }),

  // ── Close ───────────────────────────────────────────────────────────────────

  close: tenantProcedure
    .input(closeCashRegisterSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      return ctx.withTenant(async (tx) => {
        const register = await tx.cashRegister.findFirst({
          where: { userId, status: "OPEN" },
          include: { movements: true },
        });

        if (!register) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Nenhum caixa aberto encontrado" });
        }

        // Calculate expected balance
        let inflows = Number(register.openingBalance);
        let outflows = 0;

        for (const mov of register.movements) {
          const amount = Number(mov.amount);
          if (mov.type === "WITHDRAWAL") {
            outflows += amount;
          } else {
            inflows += amount;
          }
        }

        const expectedBalance = inflows - outflows;
        const difference = input.closingBalance - expectedBalance;

        return tx.cashRegister.update({
          where: { id: register.id },
          data: {
            status: "CLOSED",
            closingBalance: input.closingBalance,
            expectedBalance,
            difference,
            notes: input.notes,
            closedAt: new Date(),
          },
        });
      });
    }),

  // ── Add Movement (sangria/suprimento) ───────────────────────────────────────

  addMovement: tenantProcedure
    .input(addCashMovementSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      return ctx.withTenant(async (tx) => {
        const register = await tx.cashRegister.findFirst({
          where: { userId, status: "OPEN" },
        });

        if (!register) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Nenhum caixa aberto encontrado" });
        }

        return tx.cashMovement.create({
          data: {
            tenantId: ctx.tenantId,
            cashRegisterId: register.id,
            type: input.type,
            amount: input.amount,
            paymentMethod: input.paymentMethod,
            description: input.description,
            userId,
          },
        });
      });
    }),

  // ── List Movements (current register) ───────────────────────────────────────

  listMovements: tenantProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    return ctx.withTenant(async (tx) => {
      const register = await tx.cashRegister.findFirst({
        where: { userId, status: "OPEN" },
      });

      if (!register) return [];

      return tx.cashMovement.findMany({
        where: { cashRegisterId: register.id },
        orderBy: { createdAt: "desc" },
      });
    });
  }),

  // ── History ─────────────────────────────────────────────────────────────────

  history: tenantProcedure
    .input(listCashHistorySchema)
    .query(async ({ ctx, input }) => {
      const { from, to, page, pageSize } = input;
      const skip = page * pageSize;

      return ctx.withTenant(async (tx) => {
        const where = {
          status: "CLOSED" as const,
          ...(from || to
            ? {
                openedAt: {
                  ...(from ? { gte: from } : {}),
                  ...(to ? { lte: to } : {}),
                },
              }
            : {}),
        };

        const [items, total] = await Promise.all([
          tx.cashRegister.findMany({
            where,
            skip,
            take: pageSize,
            orderBy: { openedAt: "desc" },
          }),
          tx.cashRegister.count({ where }),
        ]);

        return { items, total, pageCount: Math.ceil(total / pageSize) };
      });
    }),

  // ── Get By Id ───────────────────────────────────────────────────────────────

  getById: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        return tx.cashRegister.findFirst({
          where: { id: input.id },
          include: { movements: { orderBy: { createdAt: "desc" } } },
        });
      });
    }),

  // ── Summary (current register by payment method) ────────────────────────────

  summary: tenantProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    return ctx.withTenant(async (tx) => {
      const register = await tx.cashRegister.findFirst({
        where: { userId, status: "OPEN" },
        include: { movements: true },
      });

      if (!register) return null;

      // Group by payment method
      const byMethod: Record<string, { inflows: number; outflows: number }> = {};
      let totalInflows = 0;
      let totalOutflows = 0;

      for (const mov of register.movements) {
        const method = mov.paymentMethod ?? "Outros";
        const amount = Number(mov.amount);

        if (!byMethod[method]) {
          byMethod[method] = { inflows: 0, outflows: 0 };
        }

        if (mov.type === "WITHDRAWAL") {
          byMethod[method].outflows += amount;
          totalOutflows += amount;
        } else {
          byMethod[method].inflows += amount;
          totalInflows += amount;
        }
      }

      return {
        openingBalance: Number(register.openingBalance),
        totalInflows,
        totalOutflows,
        currentBalance: Number(register.openingBalance) + totalInflows - totalOutflows,
        byPaymentMethod: Object.entries(byMethod).map(([method, data]) => ({
          method,
          ...data,
        })),
      };
    });
  }),
});
