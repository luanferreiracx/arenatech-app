import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Prisma } from "@prisma/client";
import { createTRPCRouter, tenantProcedure } from "@/server/api/trpc";
import {
  createTransactionSchema,
  updateTransactionSchema,
  listTransactionsSchema,
  payInstallmentSchema,
  reverseInstallmentSchema,
  cashFlowSchema,
  overdueSchema,
  dreSchema,
  projectedCashFlowSchema,
} from "@/lib/validators/financial";

// ── Helpers ──

function decimalToCents(v: Prisma.Decimal | null | undefined): number {
  if (v == null) return 0;
  return Math.round(Number(v) * 100);
}

function centsToPrismaDecimal(cents: number): Prisma.Decimal {
  return new Prisma.Decimal(cents / 100);
}

function serializeTransaction(t: {
  id: string;
  type: string;
  status: string;
  description: string;
  category: string | null;
  supplier: string | null;
  customerName: string | null;
  totalAmount: Prisma.Decimal;
  paidAmount: Prisma.Decimal;
  dueDate: Date;
  emissionDate: Date | null;
  paidAt: Date | null;
  paymentMethod: string | null;
  referenceId: string | null;
  referenceType: string | null;
  customerId: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  installments?: Array<{
    id: string;
    number: number;
    amount: Prisma.Decimal;
    dueDate: Date;
    paidAmount: Prisma.Decimal;
    paidAt: Date | null;
    paymentMethod: string | null;
    notes: string | null;
    status: string;
    createdAt: Date;
  }>;
}) {
  return {
    id: t.id,
    type: t.type,
    status: t.status,
    description: t.description,
    category: t.category,
    supplier: t.supplier,
    customerName: t.customerName,
    totalAmount: decimalToCents(t.totalAmount),
    paidAmount: decimalToCents(t.paidAmount),
    remainingAmount: decimalToCents(t.totalAmount) - decimalToCents(t.paidAmount),
    dueDate: t.dueDate,
    emissionDate: t.emissionDate,
    paidAt: t.paidAt,
    paymentMethod: t.paymentMethod,
    referenceId: t.referenceId,
    referenceType: t.referenceType,
    customerId: t.customerId,
    notes: t.notes,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    installments: t.installments?.map((inst) => ({
      id: inst.id,
      number: inst.number,
      amount: decimalToCents(inst.amount),
      dueDate: inst.dueDate,
      paidAmount: decimalToCents(inst.paidAmount),
      paidAt: inst.paidAt,
      paymentMethod: inst.paymentMethod,
      notes: inst.notes,
      status: inst.status,
      createdAt: inst.createdAt,
    })),
  };
}

/**
 * Recalculates transaction status based on installment states.
 * Faithfully replicates Laravel's recalcularStatus() logic.
 */
async function recalculateTransactionStatus(
  tx: Prisma.TransactionClient & {
    installment: { count: (args: Record<string, unknown>) => Promise<number>; aggregate: (args: Record<string, unknown>) => Promise<Record<string, unknown>> };
    financialTransaction: { update: (args: Record<string, unknown>) => Promise<unknown> };
  },
  transactionId: string,
) {
  const allInstallments = await (tx as unknown as { installment: { findMany: (a: Record<string, unknown>) => Promise<Array<{ status: string; paidAmount: Prisma.Decimal }>> } }).installment.findMany({
    where: { transactionId },
    select: { status: true, paidAmount: true },
  });

  const totalParcelas = allInstallments.length;
  const parcelasPagas = allInstallments.filter((i: { status: string }) => i.status === "PAID").length;
  const parcelasVencidas = allInstallments.filter((i: { status: string }) => i.status === "OVERDUE").length;

  const totalPago = allInstallments
    .filter((i: { status: string }) => i.status === "PAID")
    .reduce((sum: number, i: { paidAmount: Prisma.Decimal }) => sum + Number(i.paidAmount), 0);

  let newStatus: string;
  if (parcelasPagas >= totalParcelas) {
    newStatus = "PAID";
  } else if (parcelasVencidas > 0) {
    newStatus = parcelasPagas > 0 ? "PARTIALLY_PAID" : "OVERDUE";
  } else if (parcelasPagas > 0) {
    newStatus = "PARTIALLY_PAID";
  } else {
    newStatus = "PENDING";
  }

  await (tx as unknown as { financialTransaction: { update: (a: Record<string, unknown>) => Promise<unknown> } }).financialTransaction.update({
    where: { id: transactionId },
    data: {
      status: newStatus,
      paidAmount: new Prisma.Decimal(totalPago),
      paidAt: newStatus === "PAID" ? new Date() : null,
    },
  });

  return newStatus;
}

export const financialRouter = createTRPCRouter({
  /** List transactions with filters and pagination */
  list: tenantProcedure
    .input(listTransactionsSchema)
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const page = input.page ?? 0;
        const pageSize = input.pageSize ?? 20;
        const sortBy = input.sortBy ?? "createdAt";
        const sortOrder = input.sortOrder ?? "desc";

        const where: Record<string, unknown> = {
          type: input.type,
          deletedAt: null,
        };

        if (input.status) {
          where.status = input.status;
        }

        if (input.search) {
          where.OR = [
            { description: { contains: input.search, mode: "insensitive" } },
            { customerName: { contains: input.search, mode: "insensitive" } },
            { supplier: { contains: input.search, mode: "insensitive" } },
          ];
        }

        if (input.dateFrom || input.dateTo) {
          const emissionDate: Record<string, Date> = {};
          if (input.dateFrom) emissionDate.gte = new Date(input.dateFrom);
          if (input.dateTo) {
            const end = new Date(input.dateTo);
            end.setHours(23, 59, 59, 999);
            emissionDate.lte = end;
          }
          where.emissionDate = emissionDate;
        }

        const [data, total] = await Promise.all([
          tx.financialTransaction.findMany({
            where,
            include: { installments: { orderBy: { number: "asc" } } },
            orderBy: { [sortBy]: sortOrder },
            skip: page * pageSize,
            take: pageSize,
          }),
          tx.financialTransaction.count({ where }),
        ]);

        return {
          data: data.map(serializeTransaction),
          total,
          pageCount: Math.ceil(total / pageSize),
        };
      });
    }),

  /** Get transaction by ID with installments */
  getById: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const transaction = await tx.financialTransaction.findFirst({
          where: { id: input.id, deletedAt: null },
          include: { installments: { orderBy: { number: "asc" } } },
        });

        if (!transaction) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Transacao nao encontrada",
          });
        }

        return serializeTransaction(transaction);
      });
    }),

  /** Create a new financial transaction with installments */
  create: tenantProcedure
    .input(createTransactionSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const emissionDate = new Date(input.emissionDate);
        const firstDueDate = input.firstDueDate
          ? new Date(input.firstDueDate)
          : new Date(emissionDate.getTime() + 30 * 24 * 60 * 60 * 1000);

        const totalAmountDecimal = centsToPrismaDecimal(input.totalAmount);

        // Calculate last due date based on installments
        const lastDueDate = new Date(firstDueDate);
        lastDueDate.setDate(lastDueDate.getDate() + 30 * (input.numInstallments - 1));

        const transaction = await tx.financialTransaction.create({
          data: {
            tenantId: ctx.tenantId,
            type: input.type,
            status: "PENDING",
            description: input.description,
            category: input.category ?? null,
            supplier: input.supplier ?? null,
            customerName: input.customerName ?? null,
            customerId: input.customerId ?? null,
            totalAmount: totalAmountDecimal,
            paidAmount: new Prisma.Decimal(0),
            dueDate: lastDueDate,
            emissionDate,
            paymentMethod: input.paymentMethod ?? null,
            notes: input.notes ?? null,
          },
        });

        // Generate installments (faithful to Laravel logic)
        const valorParcelaCents = Math.floor(input.totalAmount / input.numInstallments);
        const valorUltimaCents = input.totalAmount - valorParcelaCents * (input.numInstallments - 1);

        for (let i = 1; i <= input.numInstallments; i++) {
          const dueDate = new Date(firstDueDate);
          dueDate.setDate(dueDate.getDate() + 30 * (i - 1));

          await tx.installment.create({
            data: {
              tenantId: ctx.tenantId,
              transactionId: transaction.id,
              number: i,
              amount: centsToPrismaDecimal(
                i === input.numInstallments ? valorUltimaCents : valorParcelaCents,
              ),
              dueDate,
              paidAmount: new Prisma.Decimal(0),
              status: "PENDING",
            },
          });
        }

        const result = await tx.financialTransaction.findUnique({
          where: { id: transaction.id },
          include: { installments: { orderBy: { number: "asc" } } },
        });

        return serializeTransaction(result!);
      });
    }),

  /** Update transaction basic fields (not paid/cancelled) */
  update: tenantProcedure
    .input(updateTransactionSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const existing = await tx.financialTransaction.findFirst({
          where: { id: input.id, deletedAt: null },
        });

        if (!existing) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Transacao nao encontrada" });
        }

        if (existing.status === "PAID" || existing.status === "CANCELLED") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Transacao paga ou cancelada nao pode ser editada",
          });
        }

        await tx.financialTransaction.update({
          where: { id: input.id },
          data: {
            description: input.description,
            category: input.category ?? null,
            supplier: input.supplier ?? null,
            customerName: input.customerName ?? null,
            notes: input.notes ?? null,
          },
        });

        return { success: true };
      });
    }),

  /** Cancel a transaction and its pending installments */
  cancel: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const existing = await tx.financialTransaction.findFirst({
          where: { id: input.id, deletedAt: null },
        });

        if (!existing) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Transacao nao encontrada" });
        }

        if (existing.status === "PAID") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Nao e possivel cancelar uma transacao ja paga",
          });
        }

        // Cancel pending/overdue installments
        await tx.installment.updateMany({
          where: {
            transactionId: input.id,
            status: { in: ["PENDING", "OVERDUE"] },
          },
          data: { status: "CANCELLED" },
        });

        await tx.financialTransaction.update({
          where: { id: input.id },
          data: { status: "CANCELLED" },
        });

        return { success: true };
      });
    }),

  /** Pay an installment (baixar parcela) */
  payInstallment: tenantProcedure
    .input(payInstallmentSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const installment = await tx.installment.findUnique({
          where: { id: input.installmentId },
          include: { transaction: true },
        });

        if (!installment) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Parcela nao encontrada" });
        }

        if (!["PENDING", "OVERDUE"].includes(installment.status)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Parcela nao pode ser baixada no status atual: ${installment.status}`,
          });
        }

        const currentPaidCents = decimalToCents(installment.paidAmount);
        const amountDueCents = decimalToCents(installment.amount) - currentPaidCents;

        if (input.amountPaid > amountDueCents + 1) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Valor pago excede o saldo da parcela (R$ ${(amountDueCents / 100).toFixed(2)})`,
          });
        }

        const newPaidCents = currentPaidCents + input.amountPaid;
        const isPaid = newPaidCents >= decimalToCents(installment.amount) - 1;

        await tx.installment.update({
          where: { id: input.installmentId },
          data: {
            paidAmount: centsToPrismaDecimal(newPaidCents),
            paidAt: new Date(),
            paymentMethod: input.paymentMethod ?? null,
            notes: input.notes ?? null,
            status: isPaid ? "PAID" : installment.status,
          },
        });

        // Recalculate transaction status (faithful to Laravel recalcularStatus)
        await recalculateTransactionStatus(tx as never, installment.transactionId);

        // If cash register is open, create a cash movement
        const userId = ctx.session.user.id;
        const openRegister = await tx.cashRegister.findFirst({
          where: { userId, status: "OPEN" },
          include: { movements: { orderBy: { createdAt: "desc" }, take: 1 } },
        });

        if (openRegister) {
          const lastMovement = openRegister.movements[0];
          const currentBalance = lastMovement
            ? decimalToCents(lastMovement.currentBalance)
            : decimalToCents(openRegister.openingBalance);

          const isReceivable = installment.transaction.type === "RECEIVABLE";
          const newBalance = isReceivable
            ? currentBalance + input.amountPaid
            : currentBalance - input.amountPaid;

          await tx.cashMovement.create({
            data: {
              tenantId: ctx.tenantId,
              cashRegisterId: openRegister.id,
              type: isReceivable ? "SALE" : "EXPENSE",
              amount: centsToPrismaDecimal(input.amountPaid),
              nature: isReceivable ? "INFLOW" : "OUTFLOW",
              paymentMethod: input.paymentMethod ?? "outros",
              description: `Baixa parcela #${installment.number} - ${installment.transaction.type === "RECEIVABLE" ? "CR" : "CP"}#${installment.transactionId.slice(0, 8)}`,
              referenceType: "installment",
              referenceId: installment.id,
              userId,
              previousBalance: centsToPrismaDecimal(currentBalance),
              currentBalance: centsToPrismaDecimal(newBalance),
            },
          });
        }

        return { success: true };
      });
    }),

  /** Reverse (estornar) a paid installment */
  reverseInstallment: tenantProcedure
    .input(reverseInstallmentSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const installment = await tx.installment.findUnique({
          where: { id: input.installmentId },
          include: { transaction: true },
        });

        if (!installment) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Parcela nao encontrada" });
        }

        if (installment.status !== "PAID") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Apenas parcelas pagas podem ser estornadas",
          });
        }

        const reversedAmount = decimalToCents(installment.paidAmount);
        const originalPaymentMethod = installment.paymentMethod;

        await tx.installment.update({
          where: { id: input.installmentId },
          data: {
            paidAmount: new Prisma.Decimal(0),
            paidAt: null,
            paymentMethod: null,
            status: "PENDING",
            notes: `${installment.notes ?? ""} | Estornado: ${input.reason}`.trim(),
          },
        });

        await recalculateTransactionStatus(tx as never, installment.transactionId);

        // Reverse cash movement if register is open
        const userId = ctx.session.user.id;
        const openRegister = await tx.cashRegister.findFirst({
          where: { userId, status: "OPEN" },
          include: { movements: { orderBy: { createdAt: "desc" }, take: 1 } },
        });

        if (openRegister && reversedAmount > 0) {
          const lastMovement = openRegister.movements[0];
          const currentBalance = lastMovement
            ? decimalToCents(lastMovement.currentBalance)
            : decimalToCents(openRegister.openingBalance);

          const isReceivable = installment.transaction.type === "RECEIVABLE";
          // Reversal: receivable reversal = outflow, payable reversal = inflow
          const newBalance = isReceivable
            ? currentBalance - reversedAmount
            : currentBalance + reversedAmount;

          await tx.cashMovement.create({
            data: {
              tenantId: ctx.tenantId,
              cashRegisterId: openRegister.id,
              type: isReceivable ? "REFUND" : "ADJUSTMENT",
              amount: centsToPrismaDecimal(reversedAmount),
              nature: isReceivable ? "OUTFLOW" : "INFLOW",
              paymentMethod: originalPaymentMethod ?? "outros",
              description: `Estorno parcela #${installment.number} - ${isReceivable ? "CR" : "CP"}#${installment.transactionId.slice(0, 8)}`,
              referenceType: "installment_reversal",
              referenceId: installment.id,
              userId,
              previousBalance: centsToPrismaDecimal(currentBalance),
              currentBalance: centsToPrismaDecimal(newBalance),
            },
          });
        }

        return { success: true };
      });
    }),

  /** Get stats for dashboard cards */
  stats: tenantProcedure
    .input(z.object({ type: z.enum(["PAYABLE", "RECEIVABLE"]) }))
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

        const [pendingResult, overdueResult, paidMonthResult] = await Promise.all([
          tx.financialTransaction.aggregate({
            where: {
              type: input.type,
              status: { in: ["PENDING", "PARTIALLY_PAID"] },
              deletedAt: null,
            },
            _sum: { totalAmount: true, paidAmount: true },
            _count: true,
          }),
          tx.financialTransaction.aggregate({
            where: {
              type: input.type,
              status: "OVERDUE",
              deletedAt: null,
            },
            _sum: { totalAmount: true, paidAmount: true },
            _count: true,
          }),
          tx.financialTransaction.aggregate({
            where: {
              type: input.type,
              status: "PAID",
              deletedAt: null,
              paidAt: { gte: startOfMonth, lte: endOfMonth },
            },
            _sum: { totalAmount: true },
            _count: true,
          }),
        ]);

        // Pending remaining = total - paid
        const pendingTotal = decimalToCents(pendingResult._sum.totalAmount);
        const pendingPaid = decimalToCents(pendingResult._sum.paidAmount);
        const pendingRemaining = pendingTotal - pendingPaid;

        const overdueTotal = decimalToCents(overdueResult._sum.totalAmount);
        const overduePaid = decimalToCents(overdueResult._sum.paidAmount);
        const overdueRemaining = overdueTotal - overduePaid;

        const paidMonthTotal = decimalToCents(paidMonthResult._sum.totalAmount);

        return {
          pendingAmount: pendingRemaining,
          pendingCount: pendingResult._count,
          overdueAmount: overdueRemaining,
          overdueCount: overdueResult._count,
          paidMonthAmount: paidMonthTotal,
          paidMonthCount: paidMonthResult._count,
        };
      });
    }),

  /** Cash flow report grouped by period */
  cashFlow: tenantProcedure
    .input(cashFlowSchema)
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const dateFrom = new Date(input.dateFrom);
        const dateTo = new Date(input.dateTo);
        dateTo.setHours(23, 59, 59, 999);

        // Get all installments in range (both paid and pending)
        const installments = await tx.installment.findMany({
          where: {
            dueDate: { gte: dateFrom, lte: dateTo },
            status: { not: "CANCELLED" },
            transaction: { deletedAt: null },
          },
          include: {
            transaction: {
              select: { type: true, description: true },
            },
          },
          orderBy: { dueDate: "asc" },
        });

        // Group by period
        const groupBy = input.groupBy ?? "day";
        const grouped: Record<string, { receivable: number; payable: number; balance: number }> = {};

        for (const inst of installments) {
          const date = inst.paidAt ?? inst.dueDate;
          let key: string;

          if (groupBy === "day") {
            key = date.toISOString().split("T")[0]!;
          } else if (groupBy === "week") {
            const d = new Date(date);
            const dayOfWeek = d.getDay();
            d.setDate(d.getDate() - dayOfWeek);
            key = d.toISOString().split("T")[0]!;
          } else {
            key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
          }

          if (!grouped[key]) {
            grouped[key] = { receivable: 0, payable: 0, balance: 0 };
          }

          const amount = inst.status === "PAID"
            ? decimalToCents(inst.paidAmount)
            : decimalToCents(inst.amount);

          if (inst.transaction.type === "RECEIVABLE") {
            grouped[key]!.receivable += amount;
          } else {
            grouped[key]!.payable += amount;
          }
          grouped[key]!.balance = grouped[key]!.receivable - grouped[key]!.payable;
        }

        // Sort by period key
        const periods = Object.entries(grouped)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([period, data]) => ({ period, ...data }));

        // Summary totals
        const totalReceivable = periods.reduce((s, p) => s + p.receivable, 0);
        const totalPayable = periods.reduce((s, p) => s + p.payable, 0);

        return {
          periods,
          summary: {
            totalReceivable,
            totalPayable,
            balance: totalReceivable - totalPayable,
          },
        };
      });
    }),

  /** List overdue installments */
  overdue: tenantProcedure
    .input(overdueSchema)
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const page = input.page ?? 0;
        const pageSize = input.pageSize ?? 20;
        const now = new Date();

        const where: Record<string, unknown> = {
          status: { in: ["PENDING", "OVERDUE"] },
          dueDate: { lt: now },
          transaction: {
            deletedAt: null,
            ...(input.type ? { type: input.type } : {}),
          },
        };

        const [data, total] = await Promise.all([
          tx.installment.findMany({
            where,
            include: {
              transaction: {
                select: {
                  id: true,
                  type: true,
                  description: true,
                  customerName: true,
                  supplier: true,
                },
              },
            },
            orderBy: { dueDate: "asc" },
            skip: page * pageSize,
            take: pageSize,
          }),
          tx.installment.count({ where }),
        ]);

        // Mark overdue ones
        const overdueIds = data
          .filter((i) => i.status === "PENDING")
          .map((i) => i.id);

        if (overdueIds.length > 0) {
          await tx.installment.updateMany({
            where: { id: { in: overdueIds } },
            data: { status: "OVERDUE" },
          });
          // Recalculate transaction statuses
          const transactionIds = [
            ...new Set(data.filter((i) => overdueIds.includes(i.id)).map((i) => i.transactionId)),
          ];
          for (const tid of transactionIds) {
            await recalculateTransactionStatus(tx as never, tid);
          }
        }

        return {
          data: data.map((inst) => ({
            id: inst.id,
            number: inst.number,
            amount: decimalToCents(inst.amount),
            paidAmount: decimalToCents(inst.paidAmount),
            dueDate: inst.dueDate,
            status: overdueIds.includes(inst.id) ? "OVERDUE" : inst.status,
            transactionId: inst.transactionId,
            transactionType: inst.transaction.type,
            transactionDescription: inst.transaction.description,
            customerName: inst.transaction.customerName,
            supplier: inst.transaction.supplier,
          })),
          total,
          pageCount: Math.ceil(total / pageSize),
        };
      });
    }),

  /** DRE - Demonstrativo de Resultados do Exercicio */
  dre: tenantProcedure
    .input(dreSchema)
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const year = input.year;
        const months: Array<{
          month: number;
          monthName: string;
          revenue: number;
          partsCost: number;
          grossProfit: number;
          expenses: number;
          netProfit: number;
        }> = [];

        const monthNames = [
          "Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho",
          "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
        ];

        for (let m = 0; m < 12; m++) {
          const startOfMonth = new Date(year, m, 1);
          const endOfMonth = new Date(year, m + 1, 0, 23, 59, 59, 999);

          // Revenue: paid receivables in this month
          const revenueResult = await tx.installment.aggregate({
            where: {
              status: "PAID",
              paidAt: { gte: startOfMonth, lte: endOfMonth },
              transaction: { type: "RECEIVABLE", deletedAt: null },
            },
            _sum: { paidAmount: true },
          });

          // Expenses (Contas a Pagar pagas)
          const expensesResult = await tx.installment.aggregate({
            where: {
              status: "PAID",
              paidAt: { gte: startOfMonth, lte: endOfMonth },
              transaction: { type: "PAYABLE", deletedAt: null },
            },
            _sum: { paidAmount: true },
          });

          // Parts cost: sum of cost from sales in period (approximation)
          // Using stock movements of type SALE in the period
          const partsCostResult = await tx.stockMovement.aggregate({
            where: {
              type: "SALE",
              createdAt: { gte: startOfMonth, lte: endOfMonth },
            },
            _sum: { unitCost: true },
          });

          const revenue = decimalToCents(revenueResult._sum.paidAmount);
          const partsCost = decimalToCents(partsCostResult._sum.unitCost);
          const grossProfit = revenue - partsCost;
          const expenses = decimalToCents(expensesResult._sum.paidAmount);
          const netProfit = grossProfit - expenses;

          months.push({
            month: m + 1,
            monthName: monthNames[m]!,
            revenue,
            partsCost,
            grossProfit,
            expenses,
            netProfit,
          });
        }

        const totals = months.reduce(
          (acc, m) => ({
            revenue: acc.revenue + m.revenue,
            partsCost: acc.partsCost + m.partsCost,
            grossProfit: acc.grossProfit + m.grossProfit,
            expenses: acc.expenses + m.expenses,
            netProfit: acc.netProfit + m.netProfit,
          }),
          { revenue: 0, partsCost: 0, grossProfit: 0, expenses: 0, netProfit: 0 },
        );

        return { months, totals, year };
      });
    }),

  /** Projected Cash Flow based on pending installments */
  projectedCashFlow: tenantProcedure
    .input(projectedCashFlowSchema)
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const endDate = new Date(today);
        endDate.setDate(endDate.getDate() + input.days);
        endDate.setHours(23, 59, 59, 999);

        // Get all pending/overdue installments in range
        const installments = await tx.installment.findMany({
          where: {
            dueDate: { gte: today, lte: endDate },
            status: { in: ["PENDING", "OVERDUE"] },
            transaction: { deletedAt: null },
          },
          include: {
            transaction: { select: { type: true } },
          },
          orderBy: { dueDate: "asc" },
        });

        // Group by day
        const dailyMap: Record<string, { receivable: number; payable: number }> = {};

        for (const inst of installments) {
          const key = inst.dueDate.toISOString().split("T")[0]!;
          if (!dailyMap[key]) {
            dailyMap[key] = { receivable: 0, payable: 0 };
          }
          const remaining = decimalToCents(inst.amount) - decimalToCents(inst.paidAmount);
          if (inst.transaction.type === "RECEIVABLE") {
            dailyMap[key]!.receivable += remaining;
          } else {
            dailyMap[key]!.payable += remaining;
          }
        }

        let cumulativeBalance = 0;
        const projection = Object.entries(dailyMap)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, data]) => {
            const dayBalance = data.receivable - data.payable;
            cumulativeBalance += dayBalance;
            return {
              date,
              receivable: data.receivable,
              payable: data.payable,
              dayBalance,
              cumulativeBalance,
            };
          });

        const totalReceivable = projection.reduce((s, p) => s + p.receivable, 0);
        const totalPayable = projection.reduce((s, p) => s + p.payable, 0);

        return {
          projection,
          summary: {
            totalReceivable,
            totalPayable,
            projectedBalance: totalReceivable - totalPayable,
          },
          days: input.days,
        };
      });
    }),
});
