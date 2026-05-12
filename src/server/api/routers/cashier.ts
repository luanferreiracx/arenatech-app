import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, tenantProcedure } from "@/server/api/trpc";
import {
  openCashRegisterSchema,
  closeCashRegisterSchema,
  addCashMovementSchema,
  listCashHistorySchema,
  paymentMethodLabels,
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

        const register = await tx.cashRegister.create({
          data: {
            tenantId: ctx.tenantId,
            userId,
            openingBalance: input.openingBalance,
            openingNotes: input.openingNotes,
            status: "OPEN",
          },
        });

        // Create opening movement with running balance
        await tx.cashMovement.create({
          data: {
            tenantId: ctx.tenantId,
            cashRegisterId: register.id,
            type: "OPENING",
            amount: input.openingBalance,
            nature: "INFLOW",
            description: "Abertura de caixa",
            userId,
            previousBalance: 0,
            currentBalance: input.openingBalance,
          },
        });

        return register;
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

        // Calculate expected balance (cash only: opening + cash sales + deposits - withdrawals - expenses)
        let cashInflows = Number(register.openingBalance);
        let cashOutflows = 0;
        let totalSales = 0;
        let totalSalesCount = 0;

        for (const mov of register.movements) {
          const amount = Number(mov.amount);
          if (mov.nature === "OUTFLOW") {
            cashOutflows += amount;
          } else if (mov.type !== "OPENING") {
            cashInflows += amount;
          }
          if (mov.type === "SALE" || mov.type === "SERVICE_ORDER") {
            totalSales += amount;
            totalSalesCount++;
          }
        }

        // Expected cash balance = opening + cash inflows - outflows
        // For dinheiro-only expected balance (like Laravel's saldo_esperado_dinheiro)
        let cashExpected = Number(register.openingBalance);
        for (const mov of register.movements) {
          if (mov.type === "OPENING") continue;
          const amount = Number(mov.amount);
          if (mov.nature === "INFLOW") {
            // Only count cash (dinheiro) for expected cash balance
            if (mov.paymentMethod === "dinheiro" || mov.type === "DEPOSIT") {
              cashExpected += amount;
            }
          } else {
            // All outflows reduce cash
            cashExpected -= amount;
          }
        }

        const expectedBalance = cashExpected;
        const difference = input.closingBalance - expectedBalance;

        // Record closing movement
        const lastMov = register.movements.sort((a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        )[0];
        const lastBalance = lastMov ? Number(lastMov.currentBalance ?? 0) : Number(register.openingBalance);

        await tx.cashMovement.create({
          data: {
            tenantId: ctx.tenantId,
            cashRegisterId: register.id,
            type: "CLOSING",
            amount: 0,
            nature: "OUTFLOW",
            description: "Fechamento de caixa",
            userId,
            previousBalance: lastBalance,
            currentBalance: lastBalance,
          },
        });

        return tx.cashRegister.update({
          where: { id: register.id },
          data: {
            status: "CLOSED",
            closingBalance: input.closingBalance,
            expectedBalance,
            difference,
            notes: input.notes,
            closingDetails: input.closingDetails ?? undefined,
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
          include: { movements: { orderBy: { createdAt: "desc" }, take: 1 } },
        });

        if (!register) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Nenhum caixa aberto encontrado" });
        }

        const nature = input.type === "WITHDRAWAL" ? "OUTFLOW" : "INFLOW";
        const lastBalance = register.movements[0]
          ? Number(register.movements[0].currentBalance ?? 0)
          : Number(register.openingBalance);

        // Validate sangria doesn't exceed cash balance (like Laravel)
        if (input.type === "WITHDRAWAL") {
          // Calculate current cash (dinheiro) balance
          const allMovements = await tx.cashMovement.findMany({
            where: { cashRegisterId: register.id },
          });

          let cashBalance = Number(register.openingBalance);
          for (const mov of allMovements) {
            if (mov.type === "OPENING") continue;
            const amount = Number(mov.amount);
            if (mov.nature === "INFLOW") {
              if (mov.paymentMethod === "dinheiro" || mov.type === "DEPOSIT") {
                cashBalance += amount;
              }
            } else {
              cashBalance -= amount;
            }
          }

          if (input.amount > cashBalance + 0.01) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Saldo em dinheiro insuficiente. Disponível: R$ ${cashBalance.toFixed(2).replace(".", ",")}`,
            });
          }
        }

        const newBalance = nature === "INFLOW"
          ? lastBalance + input.amount
          : lastBalance - input.amount;

        return tx.cashMovement.create({
          data: {
            tenantId: ctx.tenantId,
            cashRegisterId: register.id,
            type: input.type,
            amount: input.amount,
            nature,
            paymentMethod: input.type === "WITHDRAWAL" ? "dinheiro" : (input.paymentMethod ?? "dinheiro"),
            description: input.description,
            userId,
            previousBalance: lastBalance,
            currentBalance: newBalance,
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
            include: {
              movements: {
                where: { type: { in: ["SALE", "SERVICE_ORDER"] } },
                select: { id: true, amount: true },
              },
            },
          }),
          tx.cashRegister.count({ where }),
        ]);

        // Enhance each register with sales count and total
        const enrichedItems = items.map((item) => {
          const salesCount = item.movements.length;
          const salesTotal = item.movements.reduce((sum, m) => sum + Number(m.amount), 0);
          return {
            ...item,
            salesCount,
            salesTotal,
            movements: undefined, // strip from payload
          };
        });

        return { items: enrichedItems, total, pageCount: Math.ceil(total / pageSize) };
      });
    }),

  // ── Get By Id ───────────────────────────────────────────────────────────────

  getById: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const register = await tx.cashRegister.findFirst({
          where: { id: input.id },
          include: { movements: { orderBy: { createdAt: "asc" } } },
        });

        if (!register) return null;

        // Compute summary by payment method (for sales only, like Laravel)
        const salesByMethod: Record<string, { count: number; total: number }> = {};
        let totalSales = 0;
        let totalSalesCount = 0;
        let totalWithdrawals = 0;
        let totalDeposits = 0;
        let totalExpenses = 0;
        let cashSalesTotal = 0;

        for (const mov of register.movements) {
          const amount = Number(mov.amount);
          if (mov.type === "SALE" || mov.type === "SERVICE_ORDER") {
            totalSales += amount;
            totalSalesCount++;
            const method = mov.paymentMethod ?? "outros";
            if (!salesByMethod[method]) {
              salesByMethod[method] = { count: 0, total: 0 };
            }
            salesByMethod[method]!.count++;
            salesByMethod[method]!.total += amount;
            if (method === "dinheiro") {
              cashSalesTotal += amount;
            }
          } else if (mov.type === "WITHDRAWAL") {
            totalWithdrawals += amount;
          } else if (mov.type === "DEPOSIT") {
            totalDeposits += amount;
          } else if (mov.type === "EXPENSE") {
            totalExpenses += amount;
          }
        }

        // Expected cash balance (dinheiro): opening + cash sales + deposits - withdrawals - expenses
        const expectedCashBalance = Number(register.openingBalance)
          + cashSalesTotal
          + totalDeposits
          - totalWithdrawals
          - totalExpenses;

        const salesSummary = Object.entries(salesByMethod).map(([method, data]) => ({
          method,
          label: paymentMethodLabels[method] ?? method,
          ...data,
        }));

        return {
          ...register,
          salesCount: totalSalesCount,
          salesTotal: totalSales,
          totalWithdrawals,
          totalDeposits,
          totalExpenses,
          expectedCashBalance,
          salesSummary,
        };
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

      // Group by payment method, separate sales from other movements
      const salesByMethod: Record<string, { count: number; total: number }> = {};
      let totalInflows = 0;
      let totalOutflows = 0;
      let totalSales = 0;
      let totalSalesCount = 0;
      let totalWithdrawals = 0;
      let totalDeposits = 0;
      let totalExpenses = 0;
      let cashSalesTotal = 0;

      for (const mov of register.movements) {
        if (mov.type === "OPENING") continue;
        const amount = Number(mov.amount);

        if (mov.nature === "OUTFLOW") {
          totalOutflows += amount;
        } else {
          totalInflows += amount;
        }

        if (mov.type === "SALE" || mov.type === "SERVICE_ORDER") {
          totalSales += amount;
          totalSalesCount++;
          const method = mov.paymentMethod ?? "outros";
          if (!salesByMethod[method]) {
            salesByMethod[method] = { count: 0, total: 0 };
          }
          salesByMethod[method]!.count++;
          salesByMethod[method]!.total += amount;
          if (method === "dinheiro") {
            cashSalesTotal += amount;
          }
        } else if (mov.type === "WITHDRAWAL") {
          totalWithdrawals += amount;
        } else if (mov.type === "DEPOSIT") {
          totalDeposits += amount;
        } else if (mov.type === "EXPENSE") {
          totalExpenses += amount;
        }
      }

      // Expected cash balance (dinheiro-only)
      const expectedCashBalance = Number(register.openingBalance)
        + cashSalesTotal
        + totalDeposits
        - totalWithdrawals
        - totalExpenses;

      const byPaymentMethod = Object.entries(salesByMethod).map(([method, data]) => ({
        method,
        label: paymentMethodLabels[method] ?? method,
        ...data,
      }));

      return {
        openingBalance: Number(register.openingBalance),
        totalInflows,
        totalOutflows,
        currentBalance: Number(register.openingBalance) + totalInflows - totalOutflows,
        expectedCashBalance,
        totalSales,
        totalSalesCount,
        totalWithdrawals,
        totalDeposits,
        totalExpenses,
        byPaymentMethod,
      };
    });
  }),
});
