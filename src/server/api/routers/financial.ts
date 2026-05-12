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
  // ── List Transactions ───────────────────────────────────────────────────────

  listTransactions: tenantProcedure
    .input(listTransactionsSchema)
    .query(async ({ ctx, input }) => {
      const { type, status, from, to, search, page, pageSize } = input;
      const skip = page * pageSize;

      return ctx.withTenant(async (tx) => {
        const where = {
          deletedAt: null,
          ...(type ? { type } : {}),
          ...(status ? { status } : {}),
          ...(search
            ? {
                OR: [
                  { description: { contains: search, mode: "insensitive" as const } },
                  { category: { contains: search, mode: "insensitive" as const } },
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
        // Cancel all pending installments too
        await tx.installment.updateMany({
          where: {
            transactionId: input.id,
            status: { in: ["PENDING", "PARTIALLY_PAID"] },
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
            status: { in: ["PENDING", "PARTIALLY_PAID"] },
            id: { not: input.installmentId }, // exclude the one we just updated
          },
        });

        const allPaid = isFullyPaid && pendingInstallments === 0;

        await tx.financialTransaction.update({
          where: { id: installment.transactionId },
          data: {
            paidAmount: transactionPaidAmount,
            status: allPaid ? "PAID" : "PARTIALLY_PAID",
            paidAt: allPaid ? new Date() : undefined,
          },
        });

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
            // ISO week start (Monday)
            const d = new Date(date);
            const day = d.getDay();
            const diff = d.getDate() - day + (day === 0 ? -6 : 1);
            d.setDate(diff);
            key = d.toISOString().slice(0, 10);
          } else {
            // month
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
