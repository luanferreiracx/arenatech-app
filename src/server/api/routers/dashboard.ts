import { Prisma } from "@prisma/client";
import { createTRPCRouter, tenantProcedure } from "@/server/api/trpc";

function decimalToCents(v: Prisma.Decimal | null | undefined): number {
  if (v == null) return 0;
  return Math.round(Number(v) * 100);
}

export const dashboardRouter = createTRPCRouter({
  stats: tenantProcedure.query(async ({ ctx }) => {
    return ctx.withTenant(async (tx) => {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      const [
        customersTotal,
        customersMonth,
        osOpen,
        osMonth,
        salesToday,
        salesMonth,
        financialOverdue,
        productsLowStock,
      ] = await Promise.all([
        tx.customer.count({ where: { deletedAt: null } }),
        tx.customer.count({
          where: { createdAt: { gte: startOfMonth }, deletedAt: null },
        }),
        tx.serviceOrder.count({
          where: {
            status: { in: ["OPEN", "IN_DIAGNOSIS", "WAITING_APPROVAL", "APPROVED", "WAITING_PARTS", "IN_PROGRESS"] },
            deletedAt: null,
          },
        }),
        tx.serviceOrder.count({
          where: { createdAt: { gte: startOfMonth }, deletedAt: null },
        }),
        tx.sale.findMany({
          where: {
            status: "COMPLETED",
            createdAt: { gte: startOfDay },
            deletedAt: null,
          },
          select: { totalAmount: true },
        }),
        tx.sale.findMany({
          where: {
            status: "COMPLETED",
            createdAt: { gte: startOfMonth },
            deletedAt: null,
          },
          select: { totalAmount: true },
        }),
        tx.financialTransaction.count({
          where: {
            type: "RECEIVABLE",
            status: "PENDING",
            dueDate: { lt: now },
            deletedAt: null,
          },
        }),
        tx.product.count({
          where: {
            currentStock: { lte: 5 },
            active: true,
            deletedAt: null,
          },
        }),
      ]);

      const salesTodayTotal = salesToday.reduce((s, sale) => s + decimalToCents(sale.totalAmount), 0);
      const salesMonthTotal = salesMonth.reduce((s, sale) => s + decimalToCents(sale.totalAmount), 0);

      return {
        customers: { total: customersTotal, month: customersMonth },
        serviceOrders: { open: osOpen, month: osMonth },
        sales: {
          todayCount: salesToday.length,
          todayTotal: salesTodayTotal,
          monthCount: salesMonth.length,
          monthTotal: salesMonthTotal,
        },
        financialOverdue,
        productsLowStock,
      };
    });
  }),
});
