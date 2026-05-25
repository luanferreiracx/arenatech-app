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
  return Math.round(Number(v) * 100);
}

function centsToPrismaDecimal(cents: number): Prisma.Decimal {
  return new Prisma.Decimal(cents / 100);
}

export const cashierRouter = createTRPCRouter({
  /**
   * Get the current user's open cash session (if any).
   * Also returns recent history when no session is open.
   */
  current: tenantProcedure.query(async ({ ctx }) => {
    return ctx.withTenant(async (tx) => {
      const userId = ctx.session.user.id;

      // Check for open session (closedAt is null = open)
      const openSession = await tx.cashSession.findFirst({
        where: { userId, closedAt: null },
        include: {
          movements: {
            orderBy: { createdAt: "desc" },
          },
        },
      });

      if (openSession) {
        const summary = buildSummary(openSession);
        return {
          isOpen: true as const,
          register: serializeSession(openSession),
          movements: openSession.movements.map(serializeMovement),
          summary,
        };
      }

      // No open session - return recent history
      const recentSessions = await tx.cashSession.findMany({
        where: { userId },
        orderBy: { openedAt: "desc" },
        take: 5,
      });

      return {
        isOpen: false as const,
        register: null,
        movements: [],
        summary: null,
        recentRegisters: recentSessions.map(serializeSession),
      };
    });
  }),

  /** Open a new cash session */
  open: tenantProcedure
    .input(openCashRegisterSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const userId = ctx.session.user.id;

        // Only 1 open session per user
        const existing = await tx.cashSession.findFirst({
          where: { userId, closedAt: null },
        });
        if (existing) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Voce ja possui um caixa aberto",
          });
        }

        const initialDecimal = centsToPrismaDecimal(input.initialBalance);

        const session = await tx.cashSession.create({
          data: {
            tenantId: ctx.tenantId,
            userId,
            initialBalance: initialDecimal,
            openingNote: input.openingNote ?? null,
          },
        });

        // Create opening deposit movement
        await tx.cashMovement.create({
          data: {
            tenantId: ctx.tenantId,
            cashSessionId: session.id,
            type: "DEPOSIT",
            amount: initialDecimal,
            nature: "INCOME",
            description: "Abertura de caixa",
            createdByUserId: userId,
          },
        });

        return serializeSession(session);
      });
    }),

  /** Close the current cash session */
  close: tenantProcedure
    .input(closeCashRegisterSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const userId = ctx.session.user.id;

        const session = await tx.cashSession.findFirst({
          where: { userId, closedAt: null },
          include: { movements: true },
        });

        if (!session) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Nenhum caixa aberto encontrado",
          });
        }

        const summary = buildSummary(session);
        const calculatedCents = summary.expectedCashBalance;
        const declaredCents = input.declaredBalance;
        const differenceCents = declaredCents - calculatedCents;

        // Threshold: diferenca > R$ 5 (500 centavos) OU > 1% do calculado
        // exige nota de fechamento. Evita caixa fechado com -R$ 500 silencioso.
        const absDiff = Math.abs(differenceCents);
        const onePctCents = Math.max(500, Math.round(calculatedCents * 0.01));
        if (absDiff > onePctCents && !input.closingNote?.trim()) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Divergencia de R$ ${(absDiff / 100).toFixed(2)} exige observacao no fechamento.`,
          });
        }

        // Update session to close it
        await tx.cashSession.update({
          where: { id: session.id },
          data: {
            closedAt: new Date(),
            closedByUserId: userId,
            closeType: "MANUAL",
            declaredBalance: centsToPrismaDecimal(declaredCents),
            calculatedBalance: centsToPrismaDecimal(calculatedCents),
            difference: centsToPrismaDecimal(differenceCents),
            closingNote: input.closingNote ?? null,
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

        const session = await tx.cashSession.findFirst({
          where: { userId, closedAt: null },
          include: { movements: true },
        });

        if (!session) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Nenhum caixa aberto encontrado",
          });
        }

        const summary = buildSummary(session);
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

        await tx.cashMovement.create({
          data: {
            tenantId: ctx.tenantId,
            cashSessionId: session.id,
            type: "WITHDRAWAL",
            amount: centsToPrismaDecimal(input.amount),
            nature: "OUTCOME",
            paymentMethod: "dinheiro",
            description: input.description,
            createdByUserId: userId,
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

        const session = await tx.cashSession.findFirst({
          where: { userId, closedAt: null },
          include: { movements: true },
        });

        if (!session) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Nenhum caixa aberto encontrado",
          });
        }

        await tx.cashMovement.create({
          data: {
            tenantId: ctx.tenantId,
            cashSessionId: session.id,
            type: "DEPOSIT",
            amount: centsToPrismaDecimal(input.amount),
            nature: "INCOME",
            paymentMethod: "dinheiro",
            description: input.description,
            createdByUserId: userId,
          },
        });

        return { success: true };
      });
    }),

  /** Summary for the current open session (for closing screen) */
  closingSummary: tenantProcedure.query(async ({ ctx }) => {
    return ctx.withTenant(async (tx) => {
      const userId = ctx.session.user.id;

      const session = await tx.cashSession.findFirst({
        where: { userId, closedAt: null },
        include: { movements: true },
      });

      if (!session) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Nenhum caixa aberto encontrado",
        });
      }

      return {
        register: serializeSession(session),
        summary: buildSummary(session),
        paymentMethodSummary: buildPaymentMethodSummary(session.movements),
      };
    });
  }),

  /** History of closed sessions with pagination and date filter */
  history: tenantProcedure
    .input(cashRegisterHistorySchema)
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const userId = ctx.session.user.id;
        const where: Record<string, unknown> = {
          userId,
          closedAt: { not: null },
        };

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
          tx.cashSession.findMany({
            where,
            orderBy: { openedAt: "desc" },
            skip: input.page * input.pageSize,
            take: input.pageSize,
          }),
          tx.cashSession.count({ where }),
        ]);

        return {
          data: data.map(serializeSession),
          total,
          pageCount: Math.ceil(total / input.pageSize),
        };
      });
    }),

  /** Detail of a specific cash session (for report) */
  byId: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        // findFirst com tenantId explicito: defesa em profundidade caso
        // RLS falhe. RLS ja filtra, mas este predicado e safety net.
        const session = await tx.cashSession.findFirst({
          where: { id: input.id, tenantId: ctx.tenantId },
          include: {
            movements: {
              orderBy: { createdAt: "asc" },
            },
          },
        });

        if (!session) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Caixa nao encontrado",
          });
        }

        return {
          register: serializeSession(session),
          movements: session.movements.map(serializeMovement),
          summary: buildSummary(session),
          paymentMethodSummary: buildPaymentMethodSummary(session.movements),
        };
      });
    }),

  /**
   * List closed cash sessions pending review.
   * A session is pending review if `verified` is false.
   */
  pendingReviews: tenantProcedure.query(async ({ ctx }) => {
    return ctx.withTenant(async (tx) => {
      const pendingSessions = await tx.cashSession.findMany({
        where: {
          closedAt: { not: null },
          verified: false,
        },
        orderBy: { closedAt: "desc" },
        take: 50,
      });

      // Resolve user names via UserTenant — tenant-scoped, evita leak de
      // users de outros tenants (table users global sem RLS).
      const userIds = [...new Set(pendingSessions.map((r) => r.userId))];
      const userTenants = userIds.length > 0
        ? await tx.userTenant.findMany({
            where: { tenantId: ctx.tenantId, userId: { in: userIds } },
            select: { userId: true, user: { select: { name: true } } },
          })
        : [];
      const userMap = new Map(userTenants.map((ut) => [ut.userId, ut.user.name]));

      return pendingSessions.map((r) => ({
        ...serializeSession(r),
        userName: userMap.get(r.userId) ?? "Operador",
      }));
    });
  }),

  /**
   * Review (conferir) a closed cash session.
   * Sets the reported balance, calculates difference, and marks as verified.
   */
  review: tenantProcedure
    .input(reviewCashRegisterSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const session = await tx.cashSession.findFirst({
          where: { id: input.cashSessionId, tenantId: ctx.tenantId },
          include: { movements: true },
        });

        if (!session) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Caixa nao encontrado",
          });
        }

        if (session.closedAt === null) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Apenas caixas fechados podem ser conferidos",
          });
        }

        if (session.verified) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Este caixa ja foi conferido",
          });
        }

        const summary = buildSummary(session);
        const systemBalance = summary.expectedCashBalance;
        const differenceCents = input.reportedBalance - systemBalance;

        await tx.cashSession.update({
          where: { id: input.cashSessionId },
          data: {
            declaredBalance: centsToPrismaDecimal(input.reportedBalance),
            calculatedBalance: centsToPrismaDecimal(systemBalance),
            difference: centsToPrismaDecimal(differenceCents),
            verified: true,
            verifiedAt: new Date(),
            verifiedByUserId: ctx.session.user.id,
            verifiedNote: input.notes ?? null,
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
   * Check if current user has an open cash session (for PDV polling).
   * Returns minimal data without heavy queries.
   */
  statusCheck: tenantProcedure.query(async ({ ctx }) => {
    return ctx.withTenant(async (tx) => {
      const userId = ctx.session.user.id;
      const openSession = await tx.cashSession.findFirst({
        where: { userId, closedAt: null },
        select: { id: true, openedAt: true },
      });

      return {
        isOpen: !!openSession,
        registerId: openSession?.id ?? null,
        openedAt: openSession?.openedAt ?? null,
      };
    });
  }),

  /**
   * List all currently open cash sessions across all users. (Manager+)
   */
  openCashiers: tenantProcedure.query(async ({ ctx }) => {
    return ctx.withTenant(async (tx) => {
      const openSessions = await tx.cashSession.findMany({
        where: { closedAt: null },
        select: { id: true, userId: true, openedAt: true },
      });

      if (openSessions.length === 0) return [];

      // Tenant-scoped: usa UserTenant (impede leak entre tenants).
      const userIds = [...new Set(openSessions.map((r) => r.userId))];
      const userTenants = await tx.userTenant.findMany({
        where: { tenantId: ctx.tenantId, userId: { in: userIds } },
        select: { userId: true, user: { select: { name: true } } },
      });
      const userMap = new Map(userTenants.map((ut) => [ut.userId, ut.user.name]));

      return openSessions.map((r) => ({
        id: r.id,
        userId: r.userId,
        userName: userMap.get(r.userId) ?? "Operador",
        openedAt: r.openedAt,
      }));
    });
  }),

  // ═══════════════════════════════════════
  // PUBLIC API — Consumed by PDV/OS modules
  // ═══════════════════════════════════════

  /**
   * @public-api Consumed by PDV module.
   * Returns the open session for a given user (or current user if omitted).
   */
  getOpenSession: tenantProcedure
    .input(z.object({ userId: z.string().uuid().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const userId = input?.userId ?? ctx.session.user.id;
      return ctx.withTenant(async (tx) => {
        return tx.cashSession.findFirst({
          where: { userId, closedAt: null },
          select: { id: true, userId: true, openedAt: true, initialBalance: true },
        });
      });
    }),

  /**
   * @public-api Consumed by PDV module.
   * Records a sale with split payments (K7: one movement per payment method).
   * TODO: substituir por chamada real do PDV módulo quando implementado.
   */
  recordSale: tenantProcedure
    .input(z.object({
      saleId: z.string().uuid(),
      payments: z.array(z.object({
        method: z.string(),
        amount: z.number().int().min(1), // centavos
      })).min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const session = await tx.cashSession.findFirst({
          where: { userId: ctx.session.user.id, closedAt: null },
        });
        if (!session) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Caixa nao esta aberto" });
        }

        for (const payment of input.payments) {
          await tx.cashMovement.create({
            data: {
              tenantId: ctx.tenantId,
              cashSessionId: session.id,
              type: "SALE",
              nature: "INCOME",
              amount: new Prisma.Decimal(payment.amount).div(100),
              paymentMethod: payment.method,
              description: `Venda`,
              referenceType: "sale",
              referenceId: input.saleId,
              createdByUserId: ctx.session.user.id,
            },
          });
        }

        return { success: true };
      });
    }),

  /**
   * @public-api Consumed by OS module.
   * Records a service order payment.
   * TODO: substituir por chamada real do OS módulo quando implementado.
   */
  recordServiceOrderPayment: tenantProcedure
    .input(z.object({
      serviceOrderId: z.string().uuid(),
      payments: z.array(z.object({
        method: z.string(),
        amount: z.number().int().min(1),
      })).min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const session = await tx.cashSession.findFirst({
          where: { userId: ctx.session.user.id, closedAt: null },
        });
        if (!session) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Caixa nao esta aberto" });
        }

        for (const payment of input.payments) {
          await tx.cashMovement.create({
            data: {
              tenantId: ctx.tenantId,
              cashSessionId: session.id,
              type: "SALE",
              nature: "INCOME",
              amount: new Prisma.Decimal(payment.amount).div(100),
              paymentMethod: payment.method,
              description: `Pagamento OS`,
              referenceType: "service_order",
              referenceId: input.serviceOrderId,
              createdByUserId: ctx.session.user.id,
            },
          });
        }

        return { success: true };
      });
    }),

  /** Register expense (despesa avulsa) */
  expense: tenantProcedure
    .input(z.object({
      amount: z.number().int().min(1),
      paymentMethod: z.string().min(1),
      description: z.string().min(3).max(500),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const session = await tx.cashSession.findFirst({
          where: { userId: ctx.session.user.id, closedAt: null },
        });
        if (!session) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Caixa nao esta aberto" });
        }

        await tx.cashMovement.create({
          data: {
            tenantId: ctx.tenantId,
            cashSessionId: session.id,
            type: "EXPENSE",
            nature: "OUTCOME",
            amount: new Prisma.Decimal(input.amount).div(100),
            paymentMethod: input.paymentMethod,
            description: input.description,
            referenceType: "manual",
            createdByUserId: ctx.session.user.id,
          },
        });

        return { success: true };
      });
    }),

  /** Force close another user's session (Manager+) */
  forceClose: tenantProcedure
    .input(z.object({
      sessionId: z.string().uuid(),
      reason: z.string().min(3).max(200),
    }))
    .mutation(async ({ ctx, input }) => {
      const userRole = ctx.session.availableTenants.find((t) => t.id === ctx.tenantId)?.role;
      if (!userRole || userRole === "operator") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas gerente pode forcar fechamento" });
      }
      return ctx.withTenant(async (tx) => {
        const session = await tx.cashSession.findFirst({
          where: { id: input.sessionId, closedAt: null },
        });
        if (!session) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Sessao nao encontrada ou ja fechada" });
        }

        // Calculate balance and close
        const { calculateSessionBalance } = await import("@/server/services/cash-session.service");
        const calculatedBalance = await calculateSessionBalance(tx as any, session.id);

        await tx.cashSession.update({
          where: { id: session.id },
          data: {
            calculatedBalance: new Prisma.Decimal(calculatedBalance),
            declaredBalance: new Prisma.Decimal(calculatedBalance),
            difference: new Prisma.Decimal(0),
            closeType: "MANUAL",
            closedByUserId: ctx.session.user.id,
            closedAt: new Date(),
            closingNote: `Fechamento forcado: ${input.reason}`,
            verified: false,
          },
        });

        return { success: true };
      });
    }),

  // ═══════════════════════════════════════
  // SALE REVERSAL (estorno de venda)
  // ═══════════════════════════════════════

  /** Record sale reversal in open cash session (faithful to Laravel registrarEstorno) */
  recordReversal: tenantProcedure
    .input(z.object({
      saleId: z.string().uuid(),
      amount: z.number().int().min(1), // centavos
      description: z.string().max(300).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const session = await tx.cashSession.findFirst({
          where: { userId: ctx.session.user.id, closedAt: null },
        });

        if (!session) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum caixa aberto" });
        }

        await tx.cashMovement.create({
          data: {
            tenantId: ctx.tenantId,
            cashSessionId: session.id,
            type: "SALE",
            amount: new Prisma.Decimal(input.amount / 100),
            nature: "OUTCOME",
            paymentMethod: "estorno",
            description: input.description ?? `Estorno venda ${input.saleId.slice(0, 8)}`,
            referenceType: "sale_reversal",
            referenceId: input.saleId,
            createdByUserId: ctx.session.user.id,
          },
        });

        return { success: true };
      });
    }),

  // ═══════════════════════════════════════
  // MANUAL ADJUSTMENT (ajuste manual)
  // ═══════════════════════════════════════

  /** Register manual cash adjustment (faithful to Laravel registrarAjuste) */
  manualAdjustment: tenantProcedure
    .input(z.object({
      amount: z.number().int().min(1), // centavos
      nature: z.enum(["INCOME", "OUTCOME"]),
      reason: z.string().min(3, "Motivo obrigatorio").max(300),
    }))
    .mutation(async ({ ctx, input }) => {
      const userRole = ctx.session.availableTenants.find((t) => t.id === ctx.tenantId)?.role;
      if (!userRole || userRole === "operator") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas gerente pode fazer ajuste manual" });
      }

      return ctx.withTenant(async (tx) => {
        const session = await tx.cashSession.findFirst({
          where: { userId: ctx.session.user.id, closedAt: null },
        });

        if (!session) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum caixa aberto" });
        }

        await tx.cashMovement.create({
          data: {
            tenantId: ctx.tenantId,
            cashSessionId: session.id,
            type: "DEPOSIT",
            amount: new Prisma.Decimal(input.amount / 100),
            nature: input.nature,
            paymentMethod: "ajuste_manual",
            description: `[AJUSTE] ${input.reason}`,
            referenceType: "manual_adjustment",
            createdByUserId: ctx.session.user.id,
          },
        });

        return { success: true };
      });
    }),

  /**
   * Estatisticas agregadas de caixa por periodo. Paridade Laravel
   * `CaixaService::getEstatisticasPeriodo`.
   */
  periodStats: tenantProcedure
    .input(
      z.object({
        from: z.string(), // ISO date
        to: z.string(),   // ISO date
        userId: z.string().uuid().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const fromDate = new Date(input.from);
        const toDate = new Date(input.to + "T23:59:59");

        const sessions = await tx.cashSession.findMany({
          where: {
            openedAt: { gte: fromDate, lte: toDate },
            ...(input.userId ? { userId: input.userId } : {}),
          },
          include: { movements: true },
          orderBy: { openedAt: "desc" },
        });

        let totalSales = 0;
        let totalDeposits = 0;
        let totalWithdrawals = 0;
        let totalExpenses = 0;
        let totalReversals = 0;
        let totalDifference = 0;
        let sessionsCount = 0;
        let movementsCount = 0;

        for (const session of sessions) {
          sessionsCount++;
          totalDifference += Number(session.difference ?? 0);
          for (const m of session.movements) {
            movementsCount++;
            const amt = Number(m.amount);
            const signed = m.nature === "INCOME" ? amt : -amt;
            if (m.type === "SALE") totalSales += signed;
            if (m.type === "DEPOSIT") totalDeposits += signed;
            if (m.type === "WITHDRAWAL") totalWithdrawals += signed;
            if (m.type === "EXPENSE") totalExpenses += signed;
            if (m.referenceType === "reversal") totalReversals += signed;
          }
        }

        return {
          sessionsCount,
          movementsCount,
          totalSales: Math.round(totalSales * 100), // centavos
          totalDeposits: Math.round(totalDeposits * 100),
          totalWithdrawals: Math.round(totalWithdrawals * 100),
          totalExpenses: Math.round(totalExpenses * 100),
          totalReversals: Math.round(totalReversals * 100),
          totalDifference: Math.round(totalDifference * 100),
          from: input.from,
          to: input.to,
        };
      });
    }),
});

// ── Helpers ──

interface SessionWithMovements {
  id: string;
  initialBalance: Prisma.Decimal;
  declaredBalance: Prisma.Decimal | null;
  calculatedBalance: Prisma.Decimal | null;
  difference: Prisma.Decimal | null;
  movements: Array<{
    type: string;
    amount: Prisma.Decimal;
    nature: string;
    paymentMethod: string | null;
    createdAt: Date;
  }>;
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
  salesCount: number;
  /** Expected cash in drawer: opening + cash sales + deposits - withdrawals - expenses */
  expectedCashBalance: number;
}

function buildSummary(session: SessionWithMovements): Summary {
  const opening = decimalToCents(session.initialBalance);
  let totalSales = 0;
  let totalSalesCash = 0;
  let totalSalesCard = 0;
  let totalSalesPix = 0;
  let totalWithdrawals = 0;
  let totalDeposits = 0;
  let totalExpenses = 0;
  let salesCount = 0;

  for (const m of session.movements) {
    const amount = decimalToCents(m.amount);
    switch (m.type) {
      case "SALE":
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
    salesCount,
    expectedCashBalance,
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
    if (m.type !== "SALE") continue;
    const method = m.paymentMethod ?? "outros";
    if (!result[method]) result[method] = { count: 0, total: 0 };
    result[method]!.count++;
    result[method]!.total += decimalToCents(m.amount);
  }
  return result;
}

interface SerializableSession {
  id: string;
  tenantId: string;
  userId: string;
  initialBalance: Prisma.Decimal;
  declaredBalance: Prisma.Decimal | null;
  calculatedBalance: Prisma.Decimal | null;
  difference: Prisma.Decimal | null;
  openingNote: string | null;
  closingNote: string | null;
  closeType: string | null;
  verified: boolean;
  verifiedAt: Date | null;
  verifiedByUserId: string | null;
  verifiedNote: string | null;
  openedAt: Date;
  closedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function serializeSession(r: SerializableSession) {
  return {
    id: r.id,
    tenantId: r.tenantId,
    userId: r.userId,
    // Keep "status" field in API response for backward compat with UI
    status: r.closedAt ? "CLOSED" : "OPEN",
    openingBalance: decimalToCents(r.initialBalance),
    closingBalance: r.declaredBalance != null ? decimalToCents(r.declaredBalance) : null,
    expectedBalance: r.calculatedBalance != null ? decimalToCents(r.calculatedBalance) : null,
    difference: r.difference != null ? decimalToCents(r.difference) : null,
    openingNotes: r.openingNote,
    notes: r.closingNote,
    verified: r.verified,
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
  createdByUserId: string;
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
    userId: m.createdByUserId,
    createdAt: m.createdAt,
  };
}
