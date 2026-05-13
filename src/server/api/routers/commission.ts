import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Prisma } from "@prisma/client";
import { createTRPCRouter, tenantProcedure } from "@/server/api/trpc";
import { withAdmin } from "@/server/db";
import {
  createRuleSchema,
  updateRuleSchema,
  listRulesSchema,
  listCommissionsSchema,
  calculateCommissionsSchema,
  changeStatusSchema,
  batchChangeStatusSchema,
  reportSchema,
} from "@/lib/validators/commission";
import { logger } from "@/lib/logger";

// ── Helpers ──

function decimalToCents(v: Prisma.Decimal | null | undefined): number {
  if (v == null) return 0;
  return Math.round(Number(v) * 100);
}

function centsToPrisma(cents: number): Prisma.Decimal {
  return new Prisma.Decimal(cents / 100);
}

export const commissionRouter = createTRPCRouter({
  // ═══════════════════════════════════════
  // RULES CRUD
  // ═══════════════════════════════════════

  /** List commission rules */
  listRules: tenantProcedure
    .input(listRulesSchema)
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const where: Prisma.CommissionRuleWhereInput = {};
        if (input.type) where.type = input.type;
        if (input.active !== undefined) where.active = input.active;

        const rules = await tx.commissionRule.findMany({
          where,
          orderBy: { createdAt: "desc" },
        });

        return rules.map((r) => ({
          ...r,
          ratePercent: Number(r.ratePercent),
          fixedAmount: r.fixedAmount ? decimalToCents(r.fixedAmount) : null,
        }));
      });
    }),

  /** Create a commission rule */
  createRule: tenantProcedure
    .input(createRuleSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const rule = await tx.commissionRule.create({
          data: {
            tenantId: ctx.tenantId,
            name: input.name,
            type: input.type,
            role: input.role,
            ratePercent: new Prisma.Decimal(input.ratePercent),
            fixedAmount: input.fixedAmount != null ? centsToPrisma(input.fixedAmount) : null,
            active: input.active ?? true,
          },
        });
        return { id: rule.id };
      });
    }),

  /** Update a commission rule */
  updateRule: tenantProcedure
    .input(updateRuleSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const existing = await tx.commissionRule.findUnique({ where: { id: input.id } });
        if (!existing) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Regra nao encontrada" });
        }

        await tx.commissionRule.update({
          where: { id: input.id },
          data: {
            name: input.name,
            type: input.type,
            role: input.role,
            ratePercent: new Prisma.Decimal(input.ratePercent),
            fixedAmount: input.fixedAmount != null ? centsToPrisma(input.fixedAmount) : null,
            active: input.active,
          },
        });
        return { success: true };
      });
    }),

  /** Delete a commission rule */
  deleteRule: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        await tx.commissionRule.delete({ where: { id: input.id } });
        return { success: true };
      });
    }),

  // ═══════════════════════════════════════
  // COMMISSIONS
  // ═══════════════════════════════════════

  /** List commissions with filters */
  list: tenantProcedure
    .input(listCommissionsSchema)
    .query(async ({ ctx, input }) => {
      const page = input.page ?? 0;
      const pageSize = input.pageSize ?? 20;

      return ctx.withTenant(async (tx) => {
        const where: Prisma.CommissionWhereInput = {};
        if (input.status) where.status = input.status;
        if (input.type) where.type = input.type;
        if (input.userId) where.userId = input.userId;
        if (input.month) where.periodMonth = input.month;
        if (input.year) where.periodYear = input.year;

        const [data, total] = await Promise.all([
          tx.commission.findMany({
            where,
            orderBy: { createdAt: input.sortOrder ?? "desc" },
            skip: page * pageSize,
            take: pageSize,
          }),
          tx.commission.count({ where }),
        ]);

        // Fetch user names
        const userIds = [...new Set(data.map((c) => c.userId))];
        let userNames: Record<string, string> = {};
        if (userIds.length > 0) {
          const users = await withAdmin(async (adminTx) => {
            return adminTx.user.findMany({
              where: { id: { in: userIds } },
              select: { id: true, name: true },
            });
          });
          userNames = Object.fromEntries(users.map((u) => [u.id, u.name]));
        }

        return {
          data: data.map((c) => ({
            ...c,
            baseAmount: decimalToCents(c.baseAmount),
            ratePercent: Number(c.ratePercent),
            commissionAmount: decimalToCents(c.commissionAmount),
            userName: userNames[c.userId] ?? "Desconhecido",
          })),
          total,
          pageCount: Math.ceil(total / pageSize),
        };
      });
    }),

  /** Calculate commissions for a period */
  calculate: tenantProcedure
    .input(calculateCommissionsSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        // Delete existing PENDING commissions for this period
        await tx.commission.deleteMany({
          where: {
            periodMonth: input.month,
            periodYear: input.year,
            status: "PENDING",
          },
        });

        // Get active rules
        const rules = await tx.commissionRule.findMany({
          where: { active: true },
        });

        if (rules.length === 0) {
          return { created: 0 };
        }

        const startDate = new Date(input.year, input.month - 1, 1);
        const endDate = new Date(input.year, input.month, 0, 23, 59, 59, 999);

        let created = 0;

        // Process SALE commissions
        const saleRules = rules.filter((r) => r.type === "SALE");
        if (saleRules.length > 0) {
          const sales = await tx.sale.findMany({
            where: {
              status: "COMPLETED",
              saleDate: { gte: startDate, lte: endDate },
              deletedAt: null,
            },
            include: { items: true },
          });

          for (const sale of sales) {
            for (const rule of saleRules) {
              if (rule.role === "seller" && sale.sellerId) {
                const baseAmount = decimalToCents(sale.totalAmount);
                const ratePercent = Number(rule.ratePercent);
                const commissionAmount = Math.round(baseAmount * (ratePercent / 100));
                const fixedAmount = rule.fixedAmount ? decimalToCents(rule.fixedAmount) : 0;
                const totalCommission = commissionAmount + fixedAmount;

                if (totalCommission > 0) {
                  await tx.commission.create({
                    data: {
                      tenantId: ctx.tenantId,
                      userId: sale.sellerId,
                      ruleId: rule.id,
                      type: "SALE",
                      status: "PENDING",
                      referenceId: sale.id,
                      referenceType: "SALE",
                      referenceNumber: sale.number,
                      baseAmount: centsToPrisma(baseAmount),
                      ratePercent: rule.ratePercent,
                      commissionAmount: centsToPrisma(totalCommission),
                      periodMonth: input.month,
                      periodYear: input.year,
                    },
                  });
                  created++;
                }
              }
            }
          }
        }

        // Process SERVICE_ORDER commissions
        const soRules = rules.filter((r) => r.type === "SERVICE_ORDER");
        if (soRules.length > 0) {
          const serviceOrders = await tx.serviceOrder.findMany({
            where: {
              status: { in: ["PAID", "DELIVERED"] },
              updatedAt: { gte: startDate, lte: endDate },
              deletedAt: null,
            },
          });

          for (const so of serviceOrders) {
            for (const rule of soRules) {
              if (rule.role === "technician" && so.technicianId) {
                const baseAmount = decimalToCents(so.totalAmount);
                const ratePercent = Number(rule.ratePercent);
                const commissionAmount = Math.round(baseAmount * (ratePercent / 100));
                const fixedAmount = rule.fixedAmount ? decimalToCents(rule.fixedAmount) : 0;
                const totalCommission = commissionAmount + fixedAmount;

                if (totalCommission > 0) {
                  await tx.commission.create({
                    data: {
                      tenantId: ctx.tenantId,
                      userId: so.technicianId,
                      ruleId: rule.id,
                      type: "SERVICE_ORDER",
                      status: "PENDING",
                      referenceId: so.id,
                      referenceType: "SERVICE_ORDER",
                      referenceNumber: so.number,
                      baseAmount: centsToPrisma(baseAmount),
                      ratePercent: rule.ratePercent,
                      commissionAmount: centsToPrisma(totalCommission),
                      periodMonth: input.month,
                      periodYear: input.year,
                    },
                  });
                  created++;
                }
              }
            }
          }
        }

        logger.info("Commissions calculated", {
          month: input.month,
          year: input.year,
          created,
        });

        return { created };
      });
    }),

  /** Approve a commission */
  approve: tenantProcedure
    .input(changeStatusSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const commission = await tx.commission.findUnique({ where: { id: input.commissionId } });
        if (!commission) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Comissao nao encontrada" });
        }

        if (input.status === "PAID" && commission.status !== "APPROVED") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Comissao precisa ser aprovada antes de pagar" });
        }
        if (input.status === "CANCELLED" && commission.status === "PAID") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Comissao paga nao pode ser cancelada" });
        }

        await tx.commission.update({
          where: { id: input.commissionId },
          data: {
            status: input.status,
            paidAt: input.status === "PAID" ? new Date() : commission.paidAt,
          },
        });
        return { success: true };
      });
    }),

  /** Batch change status */
  batchChangeStatus: tenantProcedure
    .input(batchChangeStatusSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const data: Record<string, unknown> = { status: input.status };
        if (input.status === "PAID") {
          data.paidAt = new Date();
        }

        await tx.commission.updateMany({
          where: {
            id: { in: input.commissionIds },
            status: input.status === "PAID" ? "APPROVED" : { not: "PAID" },
          },
          data,
        });
        return { success: true };
      });
    }),

  /** Monthly report grouped by user */
  report: tenantProcedure
    .input(reportSchema)
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const commissions = await tx.commission.findMany({
          where: {
            periodMonth: input.month,
            periodYear: input.year,
          },
          orderBy: { userId: "asc" },
        });

        // Fetch user names
        const userIds = [...new Set(commissions.map((c) => c.userId))];
        let userNames: Record<string, string> = {};
        if (userIds.length > 0) {
          const users = await withAdmin(async (adminTx) => {
            return adminTx.user.findMany({
              where: { id: { in: userIds } },
              select: { id: true, name: true },
            });
          });
          userNames = Object.fromEntries(users.map((u) => [u.id, u.name]));
        }

        // Group by user
        const grouped: Record<string, {
          userId: string;
          userName: string;
          totalAmount: number;
          pendingCount: number;
          approvedCount: number;
          paidCount: number;
          cancelledCount: number;
          commissions: typeof serialized;
        }> = {};

        const serialized = commissions.map((c) => ({
          ...c,
          baseAmount: decimalToCents(c.baseAmount),
          ratePercent: Number(c.ratePercent),
          commissionAmount: decimalToCents(c.commissionAmount),
          userName: userNames[c.userId] ?? "Desconhecido",
        }));

        for (const c of serialized) {
          if (!grouped[c.userId]) {
            grouped[c.userId] = {
              userId: c.userId,
              userName: c.userName,
              totalAmount: 0,
              pendingCount: 0,
              approvedCount: 0,
              paidCount: 0,
              cancelledCount: 0,
              commissions: [],
            };
          }
          const g = grouped[c.userId]!;
          g.totalAmount += c.commissionAmount;
          if (c.status === "PENDING") g.pendingCount++;
          if (c.status === "APPROVED") g.approvedCount++;
          if (c.status === "PAID") g.paidCount++;
          if (c.status === "CANCELLED") g.cancelledCount++;
          g.commissions.push(c);
        }

        const summary = {
          totalPending: serialized.filter((c) => c.status === "PENDING").reduce((s, c) => s + c.commissionAmount, 0),
          totalApproved: serialized.filter((c) => c.status === "APPROVED").reduce((s, c) => s + c.commissionAmount, 0),
          totalPaid: serialized.filter((c) => c.status === "PAID").reduce((s, c) => s + c.commissionAmount, 0),
          totalAll: serialized.reduce((s, c) => s + c.commissionAmount, 0),
          count: serialized.length,
        };

        return {
          users: Object.values(grouped),
          summary,
        };
      });
    }),

  /** User summary (for individual view) */
  userSummary: tenantProcedure
    .input(z.object({ userId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const now = new Date();
        const commissions = await tx.commission.findMany({
          where: {
            userId: input.userId,
            periodMonth: now.getMonth() + 1,
            periodYear: now.getFullYear(),
          },
        });

        const totalPending = commissions
          .filter((c) => c.status === "PENDING")
          .reduce((s, c) => s + decimalToCents(c.commissionAmount), 0);
        const totalPaid = commissions
          .filter((c) => c.status === "PAID")
          .reduce((s, c) => s + decimalToCents(c.commissionAmount), 0);

        return {
          monthPending: totalPending,
          monthPaid: totalPaid,
          monthTotal: totalPending + totalPaid,
          count: commissions.length,
        };
      });
    }),
});
