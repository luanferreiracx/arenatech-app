import { Prisma } from "@prisma/client";
import { z } from "zod";
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
      const ticketMedio = salesMonth.length > 0 ? Math.round(salesMonthTotal / salesMonth.length) : 0;

      return {
        customers: { total: customersTotal, month: customersMonth },
        serviceOrders: { open: osOpen, month: osMonth },
        sales: {
          todayCount: salesToday.length,
          todayTotal: salesTodayTotal,
          monthCount: salesMonth.length,
          monthTotal: salesMonthTotal,
          ticketMedio,
        },
        financialOverdue,
        productsLowStock,
      };
    });
  }),

  recentSales: tenantProcedure.query(async ({ ctx }) => {
    return ctx.withTenant(async (tx) => {
      const sales = await tx.sale.findMany({
        where: { status: "COMPLETED", deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          number: true,
          totalAmount: true,
          createdAt: true,
          items: {
            select: { description: true, quantity: true },
            take: 3,
          },
        },
      });

      return sales.map((s) => ({
        id: s.id,
        number: s.number,
        totalCents: decimalToCents(s.totalAmount),
        createdAt: s.createdAt,
        itemsSummary: s.items.map((i) => `${i.quantity}x ${i.description}`).join(", "),
      }));
    });
  }),

  recentOrders: tenantProcedure.query(async ({ ctx }) => {
    return ctx.withTenant(async (tx) => {
      const orders = await tx.serviceOrder.findMany({
        where: { deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          number: true,
          status: true,
          deviceBrand: true,
          deviceModel: true,
          totalAmount: true,
          createdAt: true,
        },
      });

      return orders.map((o) => ({
        id: o.id,
        number: o.number,
        status: o.status,
        device: [o.deviceBrand, o.deviceModel].filter(Boolean).join(" ") || "N/A",
        totalCents: decimalToCents(o.totalAmount),
        createdAt: o.createdAt,
      }));
    });
  }),

  ordersByStatus: tenantProcedure.query(async ({ ctx }) => {
    return ctx.withTenant(async (tx) => {
      const statuses = [
        "OPEN",
        "IN_DIAGNOSIS",
        "WAITING_APPROVAL",
        "APPROVED",
        "WAITING_PARTS",
        "IN_PROGRESS",
        "COMPLETED",
        "PAID",
        "READY_FOR_PICKUP",
        "DELIVERED",
        "IN_WARRANTY",
        "CANCELLED",
        "REFUNDED",
      ] as const;

      const counts = await Promise.all(
        statuses.map(async (status) => {
          const count = await tx.serviceOrder.count({
            where: { status, deletedAt: null },
          });
          return { status, count };
        }),
      );

      return counts.filter((c) => c.count > 0);
    });
  }),

  salesChart: tenantProcedure
    .input(z.object({ days: z.union([z.literal(7), z.literal(30)]).default(7) }))
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const now = new Date();
        const startDate = new Date(now);
        startDate.setDate(startDate.getDate() - input.days + 1);
        startDate.setHours(0, 0, 0, 0);

        const sales = await tx.sale.findMany({
          where: {
            status: "COMPLETED",
            createdAt: { gte: startDate },
            deletedAt: null,
          },
          select: { totalAmount: true, createdAt: true },
        });

        // Group by day
        const dayMap = new Map<string, { count: number; totalCents: number }>();
        for (let i = 0; i < input.days; i++) {
          const d = new Date(startDate);
          d.setDate(d.getDate() + i);
          const key = d.toISOString().slice(0, 10);
          dayMap.set(key, { count: 0, totalCents: 0 });
        }

        for (const sale of sales) {
          const key = sale.createdAt.toISOString().slice(0, 10);
          const entry = dayMap.get(key);
          if (entry) {
            entry.count += 1;
            entry.totalCents += decimalToCents(sale.totalAmount);
          }
        }

        return Array.from(dayMap.entries()).map(([date, data]) => ({
          date,
          count: data.count,
          totalCents: data.totalCents,
        }));
      });
    }),

  alerts: tenantProcedure.query(async ({ ctx }) => {
    return ctx.withTenant(async (tx) => {
      const now = new Date();

      const [lowStockProducts, overdueFinancials, lateOrders] = await Promise.all([
        // Low stock products
        tx.product.findMany({
          where: {
            currentStock: { lte: 5 },
            active: true,
            deletedAt: null,
          },
          select: { id: true, name: true, currentStock: true, minStock: true },
          orderBy: { currentStock: "asc" },
          take: 10,
        }),

        // Overdue financial transactions
        tx.financialTransaction.findMany({
          where: {
            type: "RECEIVABLE",
            status: "PENDING",
            dueDate: { lt: now },
            deletedAt: null,
          },
          select: {
            id: true,
            description: true,
            totalAmount: true,
            dueDate: true,
            customerName: true,
          },
          orderBy: { dueDate: "asc" },
          take: 10,
        }),

        // Late service orders (open for more than 7 days)
        tx.serviceOrder.findMany({
          where: {
            status: { in: ["OPEN", "IN_DIAGNOSIS", "WAITING_APPROVAL", "APPROVED", "WAITING_PARTS", "IN_PROGRESS"] },
            entryDate: { lt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) },
            deletedAt: null,
          },
          select: {
            id: true,
            number: true,
            status: true,
            deviceBrand: true,
            deviceModel: true,
            entryDate: true,
          },
          orderBy: { entryDate: "asc" },
          take: 10,
        }),
      ]);

      return {
        lowStock: lowStockProducts,
        overdueFinancials: overdueFinancials.map((f) => ({
          id: f.id,
          description: f.description,
          totalCents: decimalToCents(f.totalAmount),
          dueDate: f.dueDate,
          customerName: f.customerName,
        })),
        lateOrders: lateOrders.map((o) => ({
          id: o.id,
          number: o.number,
          status: o.status,
          device: [o.deviceBrand, o.deviceModel].filter(Boolean).join(" ") || "N/A",
          entryDate: o.entryDate,
        })),
      };
    });
  }),

  cashierStatus: tenantProcedure.query(async ({ ctx }) => {
    return ctx.withTenant(async (tx) => {
      const userId = ctx.session.user.id;

      const openCashier = await tx.cashRegister.findFirst({
        where: {
          userId,
          status: "OPEN",
        },
        select: {
          id: true,
          openedAt: true,
          openingBalance: true,
          movements: {
            select: { amount: true, nature: true },
          },
        },
        orderBy: { openedAt: "desc" },
      });

      if (!openCashier) {
        return { isOpen: false as const };
      }

      // Count sales in this register
      const salesCount = openCashier.movements.filter((m) => m.nature === "INFLOW").length;

      // Calculate balance: opening + inflows - outflows
      let balance = decimalToCents(openCashier.openingBalance);
      for (const m of openCashier.movements) {
        const amount = decimalToCents(m.amount);
        if (m.nature === "INFLOW") {
          balance += amount;
        } else {
          balance -= amount;
        }
      }

      return {
        isOpen: true as const,
        id: openCashier.id,
        openedAt: openCashier.openedAt,
        salesCount,
        balanceCents: balance,
      };
    });
  }),
});
