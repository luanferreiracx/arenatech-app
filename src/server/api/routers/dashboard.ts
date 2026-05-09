import { createTRPCRouter, tenantProcedure } from "@/server/api/trpc";
import { startOfDay, startOfMonth } from "date-fns";

export const dashboardRouter = createTRPCRouter({
  stats: tenantProcedure.query(async ({ ctx }) => {
    return ctx.withTenant(async (tx) => {
      const today = startOfDay(new Date());
      const monthStart = startOfMonth(new Date());

      const [openOrders, todaySales, customerCount, monthRevenue] =
        await Promise.all([
          tx.serviceOrder.count({
            where: {
              status: {
                in: [
                  "OPEN",
                  "IN_DIAGNOSIS",
                  "APPROVED",
                  "WAITING_PARTS",
                  "IN_PROGRESS",
                ],
              },
              deletedAt: null,
            },
          }),
          tx.sale.count({
            where: {
              status: "COMPLETED",
              saleDate: { gte: today },
            },
          }),
          tx.customer.count({
            where: { deletedAt: null },
          }),
          tx.sale.aggregate({
            where: {
              status: "COMPLETED",
              saleDate: { gte: monthStart },
            },
            _sum: { totalAmount: true },
          }),
        ]);

      return {
        openOrders,
        todaySales,
        customerCount,
        monthRevenue: Number(monthRevenue._sum.totalAmount ?? 0),
      };
    });
  }),
});
