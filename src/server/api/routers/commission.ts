import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, tenantProcedure } from "@/server/api/trpc";
import { withAdmin } from "@/server/db";
import {
  createCommissionRuleSchema,
  updateCommissionRuleSchema,
  listCommissionRulesSchema,
  listCommissionsSchema,
  calculateCommissionsSchema,
  changeCommissionStatusSchema,
  batchChangeStatusSchema,
  commissionReportSchema,
} from "@/lib/validators/commission";

export const commissionRouter = createTRPCRouter({
  // ── List Rules ────────────────────────────────────────────────────────────

  listRules: tenantProcedure
    .input(listCommissionRulesSchema)
    .query(async ({ ctx, input }) => {
      const { type, active, page, pageSize } = input;
      const skip = page * pageSize;

      return ctx.withTenant(async (tx) => {
        const where = {
          ...(type ? { type } : {}),
          ...(active !== undefined ? { active } : {}),
        };

        const [items, total] = await Promise.all([
          tx.commissionRule.findMany({
            where,
            skip,
            take: pageSize,
            orderBy: { name: "asc" },
          }),
          tx.commissionRule.count({ where }),
        ]);

        return { items, total, pageCount: Math.ceil(total / pageSize) };
      });
    }),

  // ── Create Rule ───────────────────────────────────────────────────────────

  createRule: tenantProcedure
    .input(createCommissionRuleSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        return tx.commissionRule.create({
          data: { tenantId: ctx.tenantId, ...input },
        });
      });
    }),

  // ── Update Rule ───────────────────────────────────────────────────────────

  updateRule: tenantProcedure
    .input(updateCommissionRuleSchema.extend({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.withTenant(async (tx) => {
        const existing = await tx.commissionRule.findFirst({ where: { id } });
        if (!existing) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Regra não encontrada" });
        }
        return tx.commissionRule.update({ where: { id }, data });
      });
    }),

  // ── Delete Rule ───────────────────────────────────────────────────────────

  deleteRule: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const existing = await tx.commissionRule.findFirst({ where: { id: input.id } });
        if (!existing) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Regra não encontrada" });
        }
        return tx.commissionRule.delete({ where: { id: input.id } });
      });
    }),

  // ── List Commissions ──────────────────────────────────────────────────────

  list: tenantProcedure
    .input(listCommissionsSchema)
    .query(async ({ ctx, input }) => {
      const { userId, status, type, periodMonth, periodYear, page, pageSize } = input;
      const skip = page * pageSize;

      return ctx.withTenant(async (tx) => {
        const where = {
          ...(userId ? { userId } : {}),
          ...(status ? { status } : {}),
          ...(type ? { type } : {}),
          ...(periodMonth ? { periodMonth } : {}),
          ...(periodYear ? { periodYear } : {}),
        };

        const [items, total] = await Promise.all([
          tx.commission.findMany({
            where,
            skip,
            take: pageSize,
            orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }, { createdAt: "desc" }],
          }),
          tx.commission.count({ where }),
        ]);

        // Enrich with user names
        const userIds = [...new Set(items.map((c) => c.userId))];
        const users = await withAdmin(async (adminTx) => {
          return adminTx.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, name: true },
          });
        });
        const userMap = new Map(users.map((u) => [u.id, u.name]));

        const enrichedItems = items.map((item) => ({
          ...item,
          userName: userMap.get(item.userId) ?? "Desconhecido",
        }));

        return { items: enrichedItems, total, pageCount: Math.ceil(total / pageSize) };
      });
    }),

  // ── Calculate Commissions ─────────────────────────────────────────────────

  calculate: tenantProcedure
    .input(calculateCommissionsSchema)
    .mutation(async ({ ctx, input }) => {
      const { periodMonth, periodYear } = input;

      return ctx.withTenant(async (tx) => {
        // Get active rules
        const rules = await tx.commissionRule.findMany({
          where: { active: true },
        });

        if (rules.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Nenhuma regra de comissão ativa encontrada",
          });
        }

        // Build date range for the period
        const startDate = new Date(periodYear, periodMonth - 1, 1);
        const endDate = new Date(periodYear, periodMonth, 0, 23, 59, 59, 999);

        // Get completed sales in the period
        const sales = await tx.sale.findMany({
          where: {
            status: "COMPLETED",
            saleDate: { gte: startDate, lte: endDate },
          },
        });

        // Get completed service orders in the period (use completedDate, not updatedAt)
        const serviceOrders = await tx.serviceOrder.findMany({
          where: {
            status: { in: ["COMPLETED", "DELIVERED"] },
            completedDate: { gte: startDate, lte: endDate },
          },
        });

        // Delete existing commissions for this period (recalculate)
        await tx.commission.deleteMany({
          where: {
            periodMonth,
            periodYear,
            status: "PENDING",
          },
        });

        const created: Array<{
          userId: string;
          type: string;
          referenceNumber: string;
          commissionAmount: number;
        }> = [];

        // Process sale rules
        const saleRules = rules.filter((r) => r.type === "SALE");
        for (const sale of sales) {
          for (const rule of saleRules) {
            if (rule.role === "seller") {
              const baseAmount = Number(sale.totalAmount);
              const rate = Number(rule.ratePercent);
              const fixed = rule.fixedAmount ? Number(rule.fixedAmount) : 0;
              const commissionAmount = (baseAmount * rate) / 100 + fixed;

              if (commissionAmount > 0) {
                await tx.commission.create({
                  data: {
                    tenantId: ctx.tenantId,
                    userId: sale.sellerId,
                    ruleId: rule.id,
                    type: "SALE",
                    status: "PENDING",
                    referenceId: sale.id,
                    referenceType: "sale",
                    referenceNumber: sale.number,
                    baseAmount: sale.totalAmount,
                    ratePercent: rule.ratePercent,
                    commissionAmount,
                    periodMonth,
                    periodYear,
                  },
                });

                created.push({
                  userId: sale.sellerId,
                  type: "SALE",
                  referenceNumber: sale.number,
                  commissionAmount,
                });
              }
            }
          }
        }

        // Process service order rules
        const soRules = rules.filter((r) => r.type === "SERVICE_ORDER");
        for (const so of serviceOrders) {
          for (const rule of soRules) {
            if (rule.role === "technician" && so.technicianId) {
              const baseAmount = Number(so.totalAmount);
              const rate = Number(rule.ratePercent);
              const fixed = rule.fixedAmount ? Number(rule.fixedAmount) : 0;
              const commissionAmount = (baseAmount * rate) / 100 + fixed;

              if (commissionAmount > 0) {
                await tx.commission.create({
                  data: {
                    tenantId: ctx.tenantId,
                    userId: so.technicianId,
                    ruleId: rule.id,
                    type: "SERVICE_ORDER",
                    status: "PENDING",
                    referenceId: so.id,
                    referenceType: "service_order",
                    referenceNumber: so.number,
                    baseAmount: so.totalAmount,
                    ratePercent: rule.ratePercent,
                    commissionAmount,
                    periodMonth,
                    periodYear,
                  },
                });

                created.push({
                  userId: so.technicianId,
                  type: "SERVICE_ORDER",
                  referenceNumber: so.number,
                  commissionAmount,
                });
              }
            }
          }
        }

        return {
          salesProcessed: sales.length,
          serviceOrdersProcessed: serviceOrders.length,
          commissionsCreated: created.length,
          details: created,
        };
      });
    }),

  // ── Approve ───────────────────────────────────────────────────────────────

  approve: tenantProcedure
    .input(batchChangeStatusSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const result = await tx.commission.updateMany({
          where: {
            id: { in: input.ids },
            status: "PENDING",
          },
          data: {
            status: "APPROVED",
            ...(input.notes ? { notes: input.notes } : {}),
          },
        });
        return { updated: result.count };
      });
    }),

  // ── Pay ───────────────────────────────────────────────────────────────────

  pay: tenantProcedure
    .input(batchChangeStatusSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const result = await tx.commission.updateMany({
          where: {
            id: { in: input.ids },
            status: "APPROVED",
          },
          data: {
            status: "PAID",
            paidAt: new Date(),
            ...(input.notes ? { notes: input.notes } : {}),
          },
        });
        return { updated: result.count };
      });
    }),

  // ── Cancel ────────────────────────────────────────────────────────────────

  cancel: tenantProcedure
    .input(changeCommissionStatusSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const commission = await tx.commission.findFirst({ where: { id: input.id } });
        if (!commission) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Comissão não encontrada" });
        }
        if (commission.status === "PAID") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Comissão já paga não pode ser cancelada",
          });
        }
        return tx.commission.update({
          where: { id: input.id },
          data: {
            status: "CANCELLED",
            notes: input.notes ?? commission.notes,
          },
        });
      });
    }),

  // ── Report ────────────────────────────────────────────────────────────────

  report: tenantProcedure
    .input(commissionReportSchema)
    .query(async ({ ctx, input }) => {
      const { periodMonth, periodYear } = input;

      return ctx.withTenant(async (tx) => {
        const commissions = await tx.commission.findMany({
          where: { periodMonth, periodYear },
        });

        // Group by user
        const byUser = new Map<
          string,
          { total: number; pending: number; approved: number; paid: number; cancelled: number; count: number }
        >();

        for (const c of commissions) {
          const existing = byUser.get(c.userId) ?? {
            total: 0,
            pending: 0,
            approved: 0,
            paid: 0,
            cancelled: 0,
            count: 0,
          };
          const amount = Number(c.commissionAmount);
          existing.total += amount;
          existing.count += 1;
          if (c.status === "PENDING") existing.pending += amount;
          if (c.status === "APPROVED") existing.approved += amount;
          if (c.status === "PAID") existing.paid += amount;
          if (c.status === "CANCELLED") existing.cancelled += amount;
          byUser.set(c.userId, existing);
        }

        // Enrich with user names
        const userIds = [...byUser.keys()];
        const users = await withAdmin(async (adminTx) => {
          return adminTx.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, name: true },
          });
        });
        const userMap = new Map(users.map((u) => [u.id, u.name]));

        const userSummaries = [...byUser.entries()].map(([userId, data]) => ({
          userId,
          userName: userMap.get(userId) ?? "Desconhecido",
          ...data,
        }));

        // Totals by type
        const totalSale = commissions
          .filter((c) => c.type === "SALE" && c.status !== "CANCELLED")
          .reduce((acc, c) => acc + Number(c.commissionAmount), 0);
        const totalServiceOrder = commissions
          .filter((c) => c.type === "SERVICE_ORDER" && c.status !== "CANCELLED")
          .reduce((acc, c) => acc + Number(c.commissionAmount), 0);

        const grandTotal = commissions
          .filter((c) => c.status !== "CANCELLED")
          .reduce((acc, c) => acc + Number(c.commissionAmount), 0);

        return {
          periodMonth,
          periodYear,
          userSummaries: userSummaries.sort((a, b) => b.total - a.total),
          totalSale,
          totalServiceOrder,
          grandTotal,
          totalCount: commissions.length,
        };
      });
    }),

  // ── User Summary (my commissions) ─────────────────────────────────────────

  userSummary: tenantProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const now = new Date();
    const periodMonth = now.getMonth() + 1;
    const periodYear = now.getFullYear();

    return ctx.withTenant(async (tx) => {
      const commissions = await tx.commission.findMany({
        where: { userId, periodMonth, periodYear },
      });

      const totalPending = commissions
        .filter((c) => c.status === "PENDING")
        .reduce((acc, c) => acc + Number(c.commissionAmount), 0);
      const totalApproved = commissions
        .filter((c) => c.status === "APPROVED")
        .reduce((acc, c) => acc + Number(c.commissionAmount), 0);
      const totalPaid = commissions
        .filter((c) => c.status === "PAID")
        .reduce((acc, c) => acc + Number(c.commissionAmount), 0);
      const grandTotal = commissions
        .filter((c) => c.status !== "CANCELLED")
        .reduce((acc, c) => acc + Number(c.commissionAmount), 0);

      return {
        periodMonth,
        periodYear,
        totalPending,
        totalApproved,
        totalPaid,
        grandTotal,
        count: commissions.length,
      };
    });
  }),
});
