import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, tenantProcedure } from "@/server/api/trpc";
import {
  createTransactionSchema,
  updateTransactionSchema,
  listTransactionsSchema,
  payInstallmentSchema,
  cashFlowReportSchema,
} from "@/lib/validators/financial";

export const financialRouter = createTRPCRouter({
  // ── Stats ────────────────────────────────────────────────────────────────────

  stats: tenantProcedure
    .input(z.object({ type: z.enum(["PAYABLE", "RECEIVABLE"]).optional() }))
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

        const baseWhere = {
          deletedAt: null,
          ...(input.type ? { type: input.type } : {}),
        };

        const [pendingResult, overdueResult, paidThisMonthResult] = await Promise.all([
          // Total pending (valor_restante)
          tx.financialTransaction.aggregate({
            where: {
              ...baseWhere,
              status: { in: ["PENDING", "PARTIALLY_PAID"] },
            },
            _sum: { totalAmount: true, paidAmount: true },
          }),
          // Total overdue
          tx.financialTransaction.aggregate({
            where: {
              ...baseWhere,
              status: "OVERDUE",
            },
            _sum: { totalAmount: true, paidAmount: true },
          }),
          // Total paid this month
          tx.financialTransaction.aggregate({
            where: {
              ...baseWhere,
              status: "PAID",
              paidAt: { gte: startOfMonth, lte: endOfMonth },
            },
            _sum: { totalAmount: true },
          }),
        ]);

        const totalPending = Number(pendingResult._sum.totalAmount ?? 0) - Number(pendingResult._sum.paidAmount ?? 0);
        const totalOverdue = Number(overdueResult._sum.totalAmount ?? 0) - Number(overdueResult._sum.paidAmount ?? 0);
        const totalPaidThisMonth = Number(paidThisMonthResult._sum.totalAmount ?? 0);

        return { totalPending, totalOverdue, totalPaidThisMonth };
      });
    }),

  // ── List Transactions ───────────────────────────────────────────────────────

  listTransactions: tenantProcedure
    .input(listTransactionsSchema)
    .query(async ({ ctx, input }) => {
      const { type, status, from, to, search, referenceType, supplier, page, pageSize } = input;
      const skip = page * pageSize;

      return ctx.withTenant(async (tx) => {
        const where = {
          deletedAt: null,
          ...(type ? { type } : {}),
          ...(status ? { status } : {}),
          ...(referenceType ? { referenceType } : {}),
          ...(supplier ? { supplier: { contains: supplier, mode: "insensitive" as const } } : {}),
          ...(search
            ? {
                OR: [
                  { description: { contains: search, mode: "insensitive" as const } },
                  { category: { contains: search, mode: "insensitive" as const } },
                  { customerName: { contains: search, mode: "insensitive" as const } },
                ],
              }
            : {}),
          ...(from || to
            ? {
                dueDate: {
                  ...(from ? { gte: from } : {}),
                  ...(to ? { lte: to } : {}),
                },
              }
            : {}),
        };

        const [items, total] = await Promise.all([
          tx.financialTransaction.findMany({
            where,
            skip,
            take: pageSize,
            orderBy: { dueDate: "asc" },
            include: {
              installments: { orderBy: { number: "asc" } },
            },
          }),
          tx.financialTransaction.count({ where }),
        ]);

        return { items, total, pageCount: Math.ceil(total / pageSize) };
      });
    }),

  // ── Get Transaction ─────────────────────────────────────────────────────────

  getTransaction: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        return tx.financialTransaction.findFirst({
          where: { id: input.id, deletedAt: null },
          include: {
            installments: { orderBy: { number: "asc" } },
          },
        });
      });
    }),

  // ── Create Transaction ──────────────────────────────────────────────────────

  createTransaction: tenantProcedure
    .input(createTransactionSchema)
    .mutation(async ({ ctx, input }) => {
      const { installments: numInstallments, ...transactionData } = input;

      return ctx.withTenant(async (tx) => {
        // Compute final dueDate for the transaction (last installment's due date)
        const baseDueDate = new Date(input.dueDate);
        const lastDueDate = new Date(baseDueDate);
        lastDueDate.setMonth(lastDueDate.getMonth() + (numInstallments - 1));

        // Create transaction
        const transaction = await tx.financialTransaction.create({
          data: {
            tenantId: ctx.tenantId,
            ...transactionData,
            emissionDate: transactionData.emissionDate ?? new Date(),
            dueDate: numInstallments > 1 ? lastDueDate : baseDueDate,
          },
        });

        // Generate installments with proportional split (last gets remainder for centavos precision)
        const installmentAmount = Math.round((input.totalAmount * 100) / numInstallments) / 100;

        const installmentRecords = Array.from({ length: numInstallments }, (_, i) => {
          // Each installment gets its own fresh Date to avoid mutation bug
          const dueDate = new Date(baseDueDate);
          dueDate.setMonth(baseDueDate.getMonth() + i);

          return {
            tenantId: ctx.tenantId,
            transactionId: transaction.id,
            number: i + 1,
            amount: i === numInstallments - 1
              ? Math.round((input.totalAmount - installmentAmount * (numInstallments - 1)) * 100) / 100
              : installmentAmount,
            dueDate,
          };
        });

        await tx.installment.createMany({ data: installmentRecords });

        return tx.financialTransaction.findFirst({
          where: { id: transaction.id },
          include: { installments: { orderBy: { number: "asc" } } },
        });
      });
    }),

  // ── Update Transaction ──────────────────────────────────────────────────────

  updateTransaction: tenantProcedure
    .input(updateTransactionSchema.extend({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.withTenant(async (tx) => {
        const existing = await tx.financialTransaction.findFirst({
          where: { id, deletedAt: null },
        });
        if (!existing) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Transação não encontrada" });
        }
        if (existing.status === "PAID" || existing.status === "CANCELLED") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Transação paga ou cancelada não pode ser editada" });
        }
        return tx.financialTransaction.update({ where: { id }, data });
      });
    }),

  // ── Delete Transaction (soft) ───────────────────────────────────────────────

  deleteTransaction: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        return tx.financialTransaction.update({
          where: { id: input.id },
          data: { deletedAt: new Date() },
        });
      });
    }),

  // ── Cancel Transaction ──────────────────────────────────────────────────────

  cancelTransaction: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const existing = await tx.financialTransaction.findFirst({
          where: { id: input.id, deletedAt: null },
        });
        if (!existing) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Transação não encontrada" });
        }
        if (existing.status === "PAID") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Não é possível cancelar uma transação já paga" });
        }

        // Cancel all pending installments too
        await tx.installment.updateMany({
          where: {
            transactionId: input.id,
            status: { in: ["PENDING", "PARTIALLY_PAID", "OVERDUE"] },
          },
          data: { status: "CANCELLED" },
        });

        return tx.financialTransaction.update({
          where: { id: input.id },
          data: { status: "CANCELLED" },
        });
      });
    }),

  // ── Pay Installment ─────────────────────────────────────────────────────────

  payInstallment: tenantProcedure
    .input(payInstallmentSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const installment = await tx.installment.findFirst({
          where: { id: input.installmentId },
          include: { transaction: true },
        });

        if (!installment) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Parcela não encontrada" });
        }

        if (installment.status === "PAID" || installment.status === "CANCELLED") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Parcela já paga ou cancelada" });
        }

        // Validate amount does not exceed remaining
        const remainingOnInstallment = Number(installment.amount) - Number(installment.paidAmount);
        if (input.paidAmount > remainingOnInstallment + 0.01) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Valor pago (R$ ${input.paidAmount.toFixed(2)}) excede o saldo da parcela (R$ ${remainingOnInstallment.toFixed(2)})`,
          });
        }

        const newPaidAmount = Number(installment.paidAmount) + input.paidAmount;
        const isFullyPaid = newPaidAmount >= Number(installment.amount) - 0.01;

        // Update installment
        await tx.installment.update({
          where: { id: input.installmentId },
          data: {
            paidAmount: newPaidAmount,
            paidAt: input.paidAt ?? new Date(),
            paymentMethod: input.paymentMethod,
            notes: input.notes,
            status: isFullyPaid ? "PAID" : "PARTIALLY_PAID",
          },
        });

        // Update transaction totals
        const transactionPaidAmount = Number(installment.transaction.paidAmount) + input.paidAmount;

        // Check if all installments are paid
        const pendingInstallments = await tx.installment.count({
          where: {
            transactionId: installment.transactionId,
            status: { in: ["PENDING", "PARTIALLY_PAID", "OVERDUE"] },
            id: { not: input.installmentId },
          },
        });

        const allPaid = isFullyPaid && pendingInstallments === 0;

        // Recalculate status like Laravel
        let newStatus: "PAID" | "PARTIALLY_PAID" | "PENDING" | "OVERDUE" = "PENDING";
        if (allPaid) {
          newStatus = "PAID";
        } else if (transactionPaidAmount > 0) {
          // Check for overdue installments
          const overdueCount = await tx.installment.count({
            where: {
              transactionId: installment.transactionId,
              status: "OVERDUE",
              id: { not: input.installmentId },
            },
          });
          newStatus = overdueCount > 0 ? "OVERDUE" : "PARTIALLY_PAID";
        }

        await tx.financialTransaction.update({
          where: { id: installment.transactionId },
          data: {
            paidAmount: transactionPaidAmount,
            status: newStatus,
            paidAt: allPaid ? new Date() : undefined,
          },
        });

        // Try to create cash movement if user has open register
        // (aligned with Laravel: baixa parcela creates cash movement)
        try {
          const userId = ctx.session.user.id;
          const openRegister = await tx.cashRegister.findFirst({
            where: { userId, status: "OPEN" },
            include: { movements: { orderBy: { createdAt: "desc" }, take: 1 } },
          });

          if (openRegister) {
            const lastBalance = openRegister.movements[0]
              ? Number(openRegister.movements[0].currentBalance ?? 0)
              : Number(openRegister.openingBalance);

            const isPayable = installment.transaction.type === "PAYABLE";
            const nature = isPayable ? "OUTFLOW" : "INFLOW";
            const movType = isPayable ? "EXPENSE" : "SALE";
            const newBalance = isPayable
              ? lastBalance - input.paidAmount
              : lastBalance + input.paidAmount;

            await tx.cashMovement.create({
              data: {
                tenantId: ctx.tenantId,
                cashRegisterId: openRegister.id,
                type: movType,
                amount: input.paidAmount,
                nature,
                paymentMethod: input.paymentMethod ?? "outros",
                description: `Baixa parcela #${installment.number} - ${installment.transaction.description}`,
                referenceType: isPayable ? "installment_payable" : "installment_receivable",
                referenceId: installment.id,
                userId,
                previousBalance: lastBalance,
                currentBalance: newBalance,
              },
            });
          }
        } catch {
          // Non-critical: if cash movement fails, the payment itself is still valid
        }

        return tx.installment.findFirst({
          where: { id: input.installmentId },
        });
      });
    }),

  // ── Cash Flow Report ────────────────────────────────────────────────────────

  cashFlowReport: tenantProcedure
    .input(cashFlowReportSchema)
    .query(async ({ ctx, input }) => {
      const { from, to, groupBy } = input;

      return ctx.withTenant(async (tx) => {
        const transactions = await tx.financialTransaction.findMany({
          where: {
            deletedAt: null,
            status: { not: "CANCELLED" },
            dueDate: { gte: from, lte: to },
          },
          orderBy: { dueDate: "asc" },
        });

        // Group by period
        const groups: Record<string, { receivable: number; payable: number }> = {};

        for (const t of transactions) {
          const date = new Date(t.dueDate);
          let key: string;

          if (groupBy === "day") {
            key = date.toISOString().slice(0, 10);
          } else if (groupBy === "week") {
            const d = new Date(date);
            const day = d.getDay();
            const diff = d.getDate() - day + (day === 0 ? -6 : 1);
            d.setDate(diff);
            key = d.toISOString().slice(0, 10);
          } else {
            key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
          }

          if (!groups[key]) {
            groups[key] = { receivable: 0, payable: 0 };
          }

          const group = groups[key]!;
          const amount = Number(t.totalAmount);
          if (t.type === "RECEIVABLE") {
            group.receivable += amount;
          } else {
            group.payable += amount;
          }
        }

        const periods = Object.entries(groups)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([period, data]) => ({
            period,
            receivable: data.receivable,
            payable: data.payable,
            balance: data.receivable - data.payable,
          }));

        const totalReceivable = periods.reduce((s, p) => s + p.receivable, 0);
        const totalPayable = periods.reduce((s, p) => s + p.payable, 0);

        return {
          periods,
          totalReceivable,
          totalPayable,
          totalBalance: totalReceivable - totalPayable,
        };
      });
    }),

  // ── Overdue Report ──────────────────────────────────────────────────────────

  overdueReport: tenantProcedure.query(async ({ ctx }) => {
    return ctx.withTenant(async (tx) => {
      // Mark overdue installments (PENDING + past due date)
      await tx.installment.updateMany({
        where: {
          status: "PENDING",
          dueDate: { lt: new Date() },
        },
        data: { status: "OVERDUE" },
      });

      // Mark overdue transactions that have overdue installments
      const overdueTransactionIds = await tx.installment.findMany({
        where: { status: "OVERDUE" },
        select: { transactionId: true },
        distinct: ["transactionId"],
      });

      if (overdueTransactionIds.length > 0) {
        await tx.financialTransaction.updateMany({
          where: {
            id: { in: overdueTransactionIds.map((i) => i.transactionId) },
            status: { in: ["PENDING", "PARTIALLY_PAID"] },
          },
          data: { status: "OVERDUE" },
        });
      }

      return tx.financialTransaction.findMany({
        where: {
          deletedAt: null,
          status: { in: ["OVERDUE", "PARTIALLY_PAID"] },
          dueDate: { lt: new Date() },
        },
        orderBy: { dueDate: "asc" },
        include: { installments: { orderBy: { number: "asc" } } },
      });
    });
  }),
});
