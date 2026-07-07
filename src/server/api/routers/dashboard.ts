import { Prisma } from "@prisma/client";
import { z } from "zod";
import { createTRPCRouter, tenantProcedure } from "@/server/api/trpc";
import { resolveCurrentStockByProduct } from "@/server/services/stock-item.service";

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
      // Periodo anterior: mes passado completo
      const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const endOfPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

      const [
        customersTotal,
        customersMonth,
        customersPrevMonth,
        osOpen,
        osMonth,
        osPrevMonth,
        salesToday,
        salesMonth,
        salesPrevMonth,
        financialOverdue,
        productsLowStock,
      ] = await Promise.all([
        tx.customer.count({ where: { deletedAt: null } }),
        tx.customer.count({
          where: { createdAt: { gte: startOfMonth }, deletedAt: null },
        }),
        tx.customer.count({
          where: { createdAt: { gte: startOfPrevMonth, lte: endOfPrevMonth }, deletedAt: null },
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
        tx.serviceOrder.count({
          where: { createdAt: { gte: startOfPrevMonth, lte: endOfPrevMonth }, deletedAt: null },
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
        tx.sale.findMany({
          where: {
            status: "COMPLETED",
            createdAt: { gte: startOfPrevMonth, lte: endOfPrevMonth },
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
        // Candidatos a estoque baixo: produtos com minimo definido. O saldo real
        // (serializado/variacoes/simples) e resolvido abaixo — contar so por
        // minStock>0 marcaria como "baixo" todo produto com minimo, mesmo cheio.
        tx.product.findMany({
          where: { active: true, deletedAt: null, minStock: { gt: 0 } },
          select: {
            id: true,
            minStock: true,
            currentStock: true,
            hasVariations: true,
            isSerialized: true,
          },
        }),
      ]);

      // Estoque efetivo por produto (fonte unica) e conta so os <= minimo.
      const lowStockCandidateStock = await resolveCurrentStockByProduct(tx, productsLowStock);
      const productsLowStockCount = productsLowStock.filter(
        (p) => (lowStockCandidateStock.get(p.id) ?? 0) <= p.minStock,
      ).length;

      const salesTodayTotal = salesToday.reduce((s, sale) => s + decimalToCents(sale.totalAmount), 0);
      const salesMonthTotal = salesMonth.reduce((s, sale) => s + decimalToCents(sale.totalAmount), 0);
      const salesPrevMonthTotal = salesPrevMonth.reduce((s, sale) => s + decimalToCents(sale.totalAmount), 0);
      const ticketMedio = salesMonth.length > 0 ? Math.round(salesMonthTotal / salesMonth.length) : 0;

      // Calcula delta % (current vs previous). 0 prev = 100% se current > 0, senao 0.
      const pctDelta = (curr: number, prev: number) =>
        prev === 0 ? (curr > 0 ? 100 : 0) : Math.round(((curr - prev) / prev) * 100);

      return {
        customers: {
          total: customersTotal,
          month: customersMonth,
          previousMonth: customersPrevMonth,
          deltaPercent: pctDelta(customersMonth, customersPrevMonth),
        },
        serviceOrders: {
          open: osOpen,
          month: osMonth,
          previousMonth: osPrevMonth,
          deltaPercent: pctDelta(osMonth, osPrevMonth),
        },
        sales: {
          todayCount: salesToday.length,
          todayTotal: salesTodayTotal,
          monthCount: salesMonth.length,
          monthTotal: salesMonthTotal,
          previousMonthTotal: salesPrevMonthTotal,
          previousMonthCount: salesPrevMonth.length,
          deltaPercent: pctDelta(salesMonthTotal, salesPrevMonthTotal),
          ticketMedio,
        },
        financialOverdue,
        productsLowStock: productsLowStockCount,
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
        // Mais recentes primeiro; desempate por number desc para ordenacao determinista
        // dentro do mesmo segundo (caso de criacao em lote).
        orderBy: [{ createdAt: "desc" }, { number: "desc" }],
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

      const [lowStockCandidates, overdueFinancials, lateOrders] = await Promise.all([
        // Candidatos a estoque baixo (minimo definido). O saldo real e resolvido
        // depois; so entao filtramos <= minimo e cortamos em 10 — cortar antes
        // (take:10 no DB) podia trazer 10 produtos cheios e esconder os baixos.
        tx.product.findMany({
          where: {
            active: true,
            deletedAt: null,
            minStock: { gt: 0 },
          },
          select: {
            id: true,
            name: true,
            minStock: true,
            currentStock: true,
            hasVariations: true,
            isSerialized: true,
          },
          orderBy: { name: "asc" },
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

      // Resolve o saldo real e mantem so quem esta <= minimo (max 10 no card).
      const lowStockByProduct = await resolveCurrentStockByProduct(tx, lowStockCandidates);
      const lowStockProducts = lowStockCandidates
        .map((p) => ({
          id: p.id,
          name: p.name,
          minStock: p.minStock,
          currentStock: lowStockByProduct.get(p.id) ?? 0,
        }))
        .filter((p) => p.currentStock <= p.minStock)
        .slice(0, 10);

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

      const openSession = await tx.cashSession.findFirst({
        where: {
          userId,
          closedAt: null,
        },
        select: {
          id: true,
          openedAt: true,
          initialBalance: true,
          movements: {
            select: { amount: true, nature: true },
          },
        },
        orderBy: { openedAt: "desc" },
      });

      if (!openSession) {
        return { isOpen: false as const };
      }

      // Count sales in this session
      const salesCount = openSession.movements.filter((m) => m.nature === "INCOME").length;

      // Calculate balance: opening + incomes - outcomes
      let balance = decimalToCents(openSession.initialBalance);
      for (const m of openSession.movements) {
        const amount = decimalToCents(m.amount);
        if (m.nature === "INCOME") {
          balance += amount;
        } else {
          balance -= amount;
        }
      }

      return {
        isOpen: true as const,
        id: openSession.id,
        openedAt: openSession.openedAt,
        salesCount,
        balanceCents: balance,
      };
    });
  }),

  // ═══════════════════════════════════════
  // STOCK DASHBOARD (faithful to DashboardEstoqueController)
  // ═══════════════════════════════════════

  /** Stock inventory dashboard with metrics, alerts, and top products */
  stockDashboard: tenantProcedure.query(async ({ ctx }) => {
    return ctx.withTenant(async (tx) => {
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      // Cards metrics
      const [
        totalProducts,
        totalActiveProducts,
        lowStockProducts,
        outOfStockProducts,
        totalStockValue,
      ] = await Promise.all([
        tx.product.count({ where: { deletedAt: null } }),
        tx.product.count({ where: { active: true, deletedAt: null } }),
        tx.product.count({
          where: {
            active: true,
            deletedAt: null,
            isSerialized: false,
            currentStock: { gt: 0, lte: 5 },
          },
        }),
        tx.product.count({
          where: {
            active: true,
            deletedAt: null,
            isSerialized: false,
            currentStock: 0,
          },
        }),
        tx.product.aggregate({
          where: { active: true, deletedAt: null, isSerialized: false },
          _sum: {
            currentStock: true,
          },
        }),
      ]);

      // Top products sold last 7 days
      const recentSaleItems = await tx.saleItem.findMany({
        where: {
          sale: { status: "COMPLETED", saleDate: { gte: sevenDaysAgo } },
        },
        select: { productId: true, description: true, quantity: true, total: true },
      });

      const productSales = new Map<string, { description: string; quantity: number; total: number }>();
      for (const item of recentSaleItems) {
        const existing = productSales.get(item.productId) ?? {
          description: item.description,
          quantity: 0,
          total: 0,
        };
        existing.quantity += item.quantity;
        existing.total += Number(item.total);
        productSales.set(item.productId, existing);
      }

      const topProducts = Array.from(productSales.entries())
        .sort((a, b) => b[1].quantity - a[1].quantity)
        .slice(0, 10)
        .map(([productId, data]) => ({
          productId,
          description: data.description,
          quantity: data.quantity,
          totalCents: Math.round(data.total * 100),
        }));

      return {
        metrics: {
          totalProducts,
          totalActiveProducts,
          lowStockProducts,
          outOfStockProducts,
          totalStockUnits: totalStockValue._sum.currentStock ?? 0,
        },
        topProductsWeek: topProducts,
      };
    });
  }),

  // ═══════════════════════════════════════
  // ADVANCED ALERTS
  // ═══════════════════════════════════════

  /** Detailed alerts for the dashboard (faithful to Laravel coletarAlertas) */
  detailedAlerts: tenantProcedure.query(async ({ ctx }) => {
    return ctx.withTenant(async (tx) => {
      const now = new Date();

      const [
        overdueCount,
        pendingVerification,
        lateOrdersCount,
        lowStockCount,
      ] = await Promise.all([
        // Financial: overdue receivables
        tx.installment.count({
          where: { status: "OVERDUE" },
        }),
        // Cashier: sessions pending verification
        tx.cashSession.count({
          where: { closedAt: { not: null }, verified: false },
        }),
        // OS: orders past estimated date and not completed
        tx.serviceOrder.count({
          where: {
            status: { in: ["OPEN", "IN_DIAGNOSIS", "IN_PROGRESS", "WAITING_PARTS"] },
            estimatedDate: { lt: now },
            deletedAt: null,
          },
        }),
        // Stock: products with zero stock
        tx.product.count({
          where: {
            active: true,
            deletedAt: null,
            isSerialized: false,
            currentStock: 0,
          },
        }),
      ]);

      return {
        overdueReceivables: overdueCount,
        pendingCashierVerification: pendingVerification,
        lateServiceOrders: lateOrdersCount,
        outOfStockProducts: lowStockCount,
        totalAlerts: overdueCount + pendingVerification + lateOrdersCount + lowStockCount,
      };
    });
  }),
});
