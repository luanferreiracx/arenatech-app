import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Prisma } from "@prisma/client";
import { createTRPCRouter, tenantProcedure } from "@/server/api/trpc";
import {
  openCashRegisterSchema,
  closeCashRegisterSchema,
  withdrawalSchema,
  depositSchema,
  cashRegisterHistorySchema,
  reviewCashRegisterSchema,
} from "@/lib/validators/cashier";

/**
 * Helper: convert Decimal fields to number (centavos stored as Decimal(10,2),
 * but we expose as integer centavos to the frontend).
 */
function decimalToCents(v: Prisma.Decimal | null | undefined): number {
  if (v == null) return 0;
  // Decimal stores reais (e.g. 150.00). Convert to centavos (15000).
  return Math.round(Number(v) * 100);
}

function centsToPrismaDecimal(cents: number): Prisma.Decimal {
  return new Prisma.Decimal(cents / 100);
}

export const cashierRouter = createTRPCRouter({
  /**
   * Get the current user's open cash register (if any).
   * Also returns recent history when no register is open.
   */
  current: tenantProcedure.query(async ({ ctx }) => {
    return ctx.withTenant(async (tx) => {
      const userId = ctx.session.user.id;

      // Check for open register
      const openRegister = await tx.cashRegister.findFirst({
        where: { userId, status: "OPEN" },
        include: {
          movements: {
            orderBy: { createdAt: "desc" },
          },
        },
      });

      if (openRegister) {
        const summary = buildSummary(openRegister);
        return {
          isOpen: true as const,
          register: serializeRegister(openRegister),
          movements: openRegister.movements.map(serializeMovement),
          summary,
        };
      }

      // No open register - return recent history
      const recentRegisters = await tx.cashRegister.findMany({
        where: { userId },
        orderBy: { openedAt: "desc" },
        take: 5,
      });

      return {
        isOpen: false as const,
        register: null,
        movements: [],
        summary: null,
        recentRegisters: recentRegisters.map(serializeRegister),
      };
    });
  }),

  /** Open a new cash register */
  open: tenantProcedure
    .input(openCashRegisterSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const userId = ctx.session.user.id;

        // Only 1 open register per user
        const existing = await tx.cashRegister.findFirst({
          where: { userId, status: "OPEN" },
        });
        if (existing) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Voce ja possui um caixa aberto",
          });
        }

        const openingDecimal = centsToPrismaDecimal(input.openingBalance);

        const register = await tx.cashRegister.create({
          data: {
            tenantId: ctx.tenantId,
            userId,
            status: "OPEN",
            openingBalance: openingDecimal,
            openingNotes: input.openingNotes ?? null,
          },
        });

        // Create opening movement
        await tx.cashMovement.create({
          data: {
            tenantId: ctx.tenantId,
            cashRegisterId: register.id,
            type: "OPENING",
            amount: openingDecimal,
            nature: "INFLOW",
            description: "Abertura de caixa",
            userId,
            previousBalance: new Prisma.Decimal(0),
            currentBalance: openingDecimal,
          },
        });

        return serializeRegister(register);
      });
    }),

  /** Close the current cash register */
  close: tenantProcedure
    .input(closeCashRegisterSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const userId = ctx.session.user.id;

        const register = await tx.cashRegister.findFirst({
          where: { userId, status: "OPEN" },
          include: { movements: true },
        });

        if (!register) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Nenhum caixa aberto encontrado",
          });
        }

        const summary = buildSummary(register);
        const expectedCents = summary.expectedCashBalance;
        const reportedCents = input.reportedBalance;
        const differenceCents = reportedCents - expectedCents;

        // Create closing movement
        const lastMovement = register.movements.sort(
          (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
        )[0];
        const currentBalance = lastMovement
          ? decimalToCents(lastMovement.currentBalance)
          : decimalToCents(register.openingBalance);

        await tx.cashMovement.create({
          data: {
            tenantId: ctx.tenantId,
            cashRegisterId: register.id,
            type: "CLOSING",
            amount: new Prisma.Decimal(0),
            nature: "OUTFLOW",
            description: "Fechamento de caixa",
            userId,
            previousBalance: centsToPrismaDecimal(currentBalance),
            currentBalance: centsToPrismaDecimal(currentBalance),
          },
        });

        // Update register
        await tx.cashRegister.update({
          where: { id: register.id },
          data: {
            status: "CLOSED",
            closingBalance: centsToPrismaDecimal(reportedCents),
            expectedBalance: centsToPrismaDecimal(expectedCents),
            difference: centsToPrismaDecimal(differenceCents),
            notes: input.notes ?? null,
            closingDetails: input.closingDetails ?? Prisma.JsonNull,
            closedAt: new Date(),
          },
        });

        return { success: true, difference: differenceCents };
      });
    }),

  /** Register a withdrawal (sangria) */
  withdrawal: tenantProcedure
    .input(withdrawalSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const userId = ctx.session.user.id;

        const register = await tx.cashRegister.findFirst({
          where: { userId, status: "OPEN" },
          include: { movements: true },
        });

        if (!register) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Nenhum caixa aberto encontrado",
          });
        }

        const summary = buildSummary(register);
        if (input.amount > summary.expectedCashBalance) {
          const available = (summary.expectedCashBalance / 100).toLocaleString(
            "pt-BR",
            { style: "currency", currency: "BRL" },
          );
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Saldo em dinheiro insuficiente. Disponivel: ${available}`,
          });
        }

        const currentBalance = getCurrentBalance(register);
        const newBalance = currentBalance - input.amount;

        await tx.cashMovement.create({
          data: {
            tenantId: ctx.tenantId,
            cashRegisterId: register.id,
            type: "WITHDRAWAL",
            amount: centsToPrismaDecimal(input.amount),
            nature: "OUTFLOW",
            paymentMethod: "dinheiro",
            description: input.description,
            userId,
            previousBalance: centsToPrismaDecimal(currentBalance),
            currentBalance: centsToPrismaDecimal(newBalance),
          },
        });

        return { success: true };
      });
    }),

  /** Register a deposit (suprimento) */
  deposit: tenantProcedure
    .input(depositSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const userId = ctx.session.user.id;

        const register = await tx.cashRegister.findFirst({
          where: { userId, status: "OPEN" },
          include: { movements: true },
        });

        if (!register) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Nenhum caixa aberto encontrado",
          });
        }

        const currentBalance = getCurrentBalance(register);
        const newBalance = currentBalance + input.amount;

        await tx.cashMovement.create({
          data: {
            tenantId: ctx.tenantId,
            cashRegisterId: register.id,
            type: "DEPOSIT",
            amount: centsToPrismaDecimal(input.amount),
            nature: "INFLOW",
            paymentMethod: "dinheiro",
            description: input.description,
            userId,
            previousBalance: centsToPrismaDecimal(currentBalance),
            currentBalance: centsToPrismaDecimal(newBalance),
          },
        });

        return { success: true };
      });
    }),

  /** Summary for the current open register (for closing screen) */
  closingSummary: tenantProcedure.query(async ({ ctx }) => {
    return ctx.withTenant(async (tx) => {
      const userId = ctx.session.user.id;

      const register = await tx.cashRegister.findFirst({
        where: { userId, status: "OPEN" },
        include: { movements: true },
      });

      if (!register) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Nenhum caixa aberto encontrado",
        });
      }

      return {
        register: serializeRegister(register),
        summary: buildSummary(register),
        paymentMethodSummary: buildPaymentMethodSummary(register.movements),
      };
    });
  }),

  /** History of closed registers with pagination and date filter */
  history: tenantProcedure
    .input(cashRegisterHistorySchema)
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const userId = ctx.session.user.id;
        const where: Record<string, unknown> = { userId };

        if (input.dateFrom || input.dateTo) {
          const openedAt: Record<string, Date> = {};
          if (input.dateFrom) openedAt.gte = new Date(input.dateFrom);
          if (input.dateTo) {
            const end = new Date(input.dateTo);
            end.setHours(23, 59, 59, 999);
            openedAt.lte = end;
          }
          where.openedAt = openedAt;
        }

        const [data, total] = await Promise.all([
          tx.cashRegister.findMany({
            where,
            orderBy: { openedAt: "desc" },
            skip: input.page * input.pageSize,
            take: input.pageSize,
          }),
          tx.cashRegister.count({ where }),
        ]);

        return {
          data: data.map(serializeRegister),
          total,
          pageCount: Math.ceil(total / input.pageSize),
        };
      });
    }),

  /** Detail of a specific cash register (for report) */
  byId: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const register = await tx.cashRegister.findUnique({
          where: { id: input.id },
          include: {
            movements: {
              orderBy: { createdAt: "asc" },
            },
          },
        });

        if (!register) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Caixa nao encontrado",
          });
        }

        return {
          register: serializeRegister(register),
          movements: register.movements.map(serializeMovement),
          summary: buildSummary(register),
          paymentMethodSummary: buildPaymentMethodSummary(register.movements),
        };
      });
    }),

  /**
   * List closed cash registers that have not been reviewed (conferencia pendente).
   * Closed registers with no closingBalance (auto-closed) or with null difference
   * are considered pending review.
   */
  pendingReviews: tenantProcedure.query(async ({ ctx }) => {
    return ctx.withTenant(async (tx) => {
      const pendingRegisters = await tx.cashRegister.findMany({
        where: {
          status: "CLOSED",
          // A register is pending review if closingBalance was not verified
          // i.e. difference is null or closingDetails contains no review marker
          OR: [
            { difference: null },
            {
              closingDetails: {
                path: ["reviewed"],
                equals: Prisma.DbNull,
              },
            },
          ],
        },
        orderBy: { closedAt: "desc" },
        take: 50,
      });

      // Resolve user names
      const userIds = [...new Set(pendingRegisters.map((r) => r.userId))];
      const users = userIds.length > 0
        ? await (tx as unknown as { user: { findMany: (a: Record<string, unknown>) => Promise<Array<{ id: string; name: string }>> } }).user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, name: true },
          })
        : [];
      const userMap = new Map(users.map((u) => [u.id, u.name]));

      return pendingRegisters.map((r) => ({
        ...serializeRegister(r),
        userName: userMap.get(r.userId) ?? "Operador",
      }));
    });
  }),

  /**
   * Review (conferir) a closed cash register.
   * Sets the reported balance, calculates difference, and marks as reviewed.
   */
  review: tenantProcedure
    .input(reviewCashRegisterSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const register = await tx.cashRegister.findUnique({
          where: { id: input.cashRegisterId },
          include: { movements: true },
        });

        if (!register) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Caixa nao encontrado",
          });
        }

        if (register.status !== "CLOSED") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Apenas caixas fechados podem ser conferidos",
          });
        }

        // Check if already reviewed
        const details = register.closingDetails as Record<string, unknown> | null;
        if (details?.["reviewed"] === true) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Este caixa ja foi conferido",
          });
        }

        const summary = buildSummary(register);
        const systemBalance = summary.expectedCashBalance;
        const differenceCents = input.reportedBalance - systemBalance;

        const existingNotes = register.notes ?? "";
        const reviewerName = ctx.session.user.name ?? "Conferente";
        const reviewNote = input.notes
          ? `[Conferencia ${new Date().toLocaleDateString("pt-BR")} por ${reviewerName}] ${input.notes}`
          : "";
        const finalNotes = existingNotes
          ? (reviewNote ? `${existingNotes}\n\n${reviewNote}` : existingNotes)
          : reviewNote;

        await tx.cashRegister.update({
          where: { id: input.cashRegisterId },
          data: {
            closingBalance: centsToPrismaDecimal(input.reportedBalance),
            expectedBalance: centsToPrismaDecimal(systemBalance),
            difference: centsToPrismaDecimal(differenceCents),
            notes: finalNotes || null,
            closingDetails: {
              ...(details ?? {}),
              reviewed: true,
              reviewedAt: new Date().toISOString(),
              reviewedBy: ctx.session.user.id,
            },
          },
        });

        return {
          success: true,
          systemBalance,
          reportedBalance: input.reportedBalance,
          difference: differenceCents,
        };
      });
    }),

  /**
   * Check if current user has an open cash register (for PDV polling).
   * Returns minimal data without heavy queries.
   */
  statusCheck: tenantProcedure.query(async ({ ctx }) => {
    return ctx.withTenant(async (tx) => {
      const userId = ctx.session.user.id;
      const openRegister = await tx.cashRegister.findFirst({
        where: { userId, status: "OPEN" },
        select: { id: true, openedAt: true },
      });

      return {
        isOpen: !!openRegister,
        registerId: openRegister?.id ?? null,
        openedAt: openRegister?.openedAt ?? null,
      };
    });
  }),

  /**
   * List all currently open cash registers across all users (for users
   * without their own register to select which one to use).
   */
  openCashiers: tenantProcedure.query(async ({ ctx }) => {
    return ctx.withTenant(async (tx) => {
      const openRegisters = await tx.cashRegister.findMany({
        where: { status: "OPEN" },
        select: { id: true, userId: true, openedAt: true },
      });

      if (openRegisters.length === 0) return [];

      const userIds = [...new Set(openRegisters.map((r) => r.userId))];
      const users = await (tx as unknown as { user: { findMany: (a: Record<string, unknown>) => Promise<Array<{ id: string; name: string }>> } }).user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true },
      });
      const userMap = new Map(users.map((u) => [u.id, u.name]));

      return openRegisters.map((r) => ({
        id: r.id,
        userId: r.userId,
        userName: userMap.get(r.userId) ?? "Operador",
        openedAt: r.openedAt,
      }));
    });
  }),
});

// ── Helpers ──

interface RegisterWithMovements {
  id: string;
  openingBalance: Prisma.Decimal;
  closingBalance: Prisma.Decimal | null;
  expectedBalance: Prisma.Decimal | null;
  difference: Prisma.Decimal | null;
  movements: Array<{
    type: string;
    amount: Prisma.Decimal;
    nature: string;
    paymentMethod: string | null;
    currentBalance: Prisma.Decimal | null;
    createdAt: Date;
  }>;
}

function getCurrentBalance(register: RegisterWithMovements): number {
  const sorted = [...register.movements].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  );
  if (sorted.length > 0) {
    return decimalToCents(sorted[0]!.currentBalance);
  }
  return decimalToCents(register.openingBalance);
}

interface Summary {
  openingBalance: number;
  totalSales: number;
  totalSalesCash: number;
  totalSalesCard: number;
  totalSalesPix: number;
  totalWithdrawals: number;
  totalDeposits: number;
  totalExpenses: number;
  totalRefunds: number;
  salesCount: number;
  /** Expected cash in drawer: opening + cash sales + deposits - withdrawals - expenses */
  expectedCashBalance: number;
  currentBalance: number;
}

function buildSummary(register: RegisterWithMovements): Summary {
  const opening = decimalToCents(register.openingBalance);
  let totalSales = 0;
  let totalSalesCash = 0;
  let totalSalesCard = 0;
  let totalSalesPix = 0;
  let totalWithdrawals = 0;
  let totalDeposits = 0;
  let totalExpenses = 0;
  let totalRefunds = 0;
  let salesCount = 0;

  for (const m of register.movements) {
    const amount = decimalToCents(m.amount);
    switch (m.type) {
      case "SALE":
      case "SERVICE_ORDER":
        totalSales += amount;
        salesCount++;
        if (m.paymentMethod === "dinheiro") totalSalesCash += amount;
        else if (
          m.paymentMethod === "cartao_credito" ||
          m.paymentMethod === "cartao_debito"
        )
          totalSalesCard += amount;
        else if (m.paymentMethod === "pix") totalSalesPix += amount;
        break;
      case "WITHDRAWAL":
        totalWithdrawals += amount;
        break;
      case "DEPOSIT":
        totalDeposits += amount;
        break;
      case "EXPENSE":
        totalExpenses += amount;
        break;
      case "REFUND":
        totalRefunds += amount;
        break;
    }
  }

  const expectedCashBalance =
    opening + totalSalesCash + totalDeposits - totalWithdrawals - totalExpenses;

  return {
    openingBalance: opening,
    totalSales,
    totalSalesCash,
    totalSalesCard,
    totalSalesPix,
    totalWithdrawals,
    totalDeposits,
    totalExpenses,
    totalRefunds,
    salesCount,
    expectedCashBalance,
    currentBalance: getCurrentBalance(register),
  };
}

interface MovementForSummary {
  type: string;
  amount: Prisma.Decimal;
  paymentMethod: string | null;
}

function buildPaymentMethodSummary(
  movements: MovementForSummary[],
): Record<string, { count: number; total: number }> {
  const result: Record<string, { count: number; total: number }> = {};
  for (const m of movements) {
    if (m.type !== "SALE" && m.type !== "SERVICE_ORDER") continue;
    const method = m.paymentMethod ?? "outros";
    if (!result[method]) result[method] = { count: 0, total: 0 };
    result[method]!.count++;
    result[method]!.total += decimalToCents(m.amount);
  }
  return result;
}

interface SerializableRegister {
  id: string;
  tenantId: string;
  userId: string;
  status: string;
  openingBalance: Prisma.Decimal;
  closingBalance: Prisma.Decimal | null;
  expectedBalance: Prisma.Decimal | null;
  difference: Prisma.Decimal | null;
  openingNotes: string | null;
  notes: string | null;
  closingDetails: Prisma.JsonValue;
  openedAt: Date;
  closedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function serializeRegister(r: SerializableRegister) {
  return {
    id: r.id,
    tenantId: r.tenantId,
    userId: r.userId,
    status: r.status,
    openingBalance: decimalToCents(r.openingBalance),
    closingBalance: r.closingBalance != null ? decimalToCents(r.closingBalance) : null,
    expectedBalance: r.expectedBalance != null ? decimalToCents(r.expectedBalance) : null,
    difference: r.difference != null ? decimalToCents(r.difference) : null,
    openingNotes: r.openingNotes,
    notes: r.notes,
    closingDetails: r.closingDetails as Record<string, unknown> | null,
    openedAt: r.openedAt,
    closedAt: r.closedAt,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

interface SerializableMovement {
  id: string;
  type: string;
  amount: Prisma.Decimal;
  nature: string;
  paymentMethod: string | null;
  description: string | null;
  referenceId: string | null;
  referenceType: string | null;
  userId: string;
  previousBalance: Prisma.Decimal | null;
  currentBalance: Prisma.Decimal | null;
  createdAt: Date;
}

function serializeMovement(m: SerializableMovement) {
  return {
    id: m.id,
    type: m.type,
    amount: decimalToCents(m.amount),
    nature: m.nature,
    paymentMethod: m.paymentMethod,
    description: m.description,
    referenceId: m.referenceId,
    referenceType: m.referenceType,
    userId: m.userId,
    previousBalance: m.previousBalance != null ? decimalToCents(m.previousBalance as Prisma.Decimal) : null,
    currentBalance: m.currentBalance != null ? decimalToCents(m.currentBalance as Prisma.Decimal) : null,
    createdAt: m.createdAt,
  };
}
