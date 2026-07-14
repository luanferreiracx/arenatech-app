import { Prisma } from "@prisma/client";
import { z } from "zod";
import { createTRPCRouter, tenantProcedure } from "@/server/api/trpc";
import { resolveCurrentStockByProduct } from "@/server/services/stock-item.service";
import {
  startOfTodayBrt,
  startOfMonthBrt,
  startOfPrevMonthBrt,
  endOfPrevMonthBrt,
  brtDayKey,
} from "@/lib/utils/date-range";

function decimalToCents(v: Prisma.Decimal | null | undefined): number {
  if (v == null) return 0;
  return Math.round(Number(v) * 100);
}

/**
 * D2 (auditoria fin 2026-07-10): faturamento de vendas num período, com a MESMA
 * definição do DRE (financial.dre) — fonte única de "receita de mercadoria".
 * Antes a home somava `totalAmount` (líquido do trade-in, corte por createdAt,
 * só COMPLETED) e divergia do DRE, mostrando dois faturamentos diferentes.
 * Regra idêntica ao DRE: receita = GREATEST(subtotal − desconto, 0) − taxa
 * operadora, escalada pela fração de itens MANTIDOS (estorno parcial), por
 * sale_date, incluindo COMPLETED e PARTIALLY_REFUNDED. Ver lib/sales/sale-revenue.
 */
async function computePeriodSalesRevenue(
  tx: Prisma.TransactionClient,
  from: Date,
  to: Date,
): Promise<{ revenueCents: number; count: number }> {
  const rows = await tx.$queryRaw<Array<{ total: number | null; cnt: number | null }>>`
    SELECT COALESCE(SUM(
             (GREATEST(s.subtotal - s.discount_amount, 0) - s.operator_fee_amount)
             * CASE
                 WHEN s.is_os_payment THEN 1
                 WHEN s.subtotal > 0 THEN LEAST(COALESCE(li.live_total, 0) / s.subtotal, 1)
                 ELSE 1
               END
           ), 0)::float AS total,
           COUNT(*)::int AS cnt
    FROM sales s
    LEFT JOIN (
      SELECT sale_id, SUM(total) AS live_total FROM sale_items GROUP BY sale_id
    ) li ON li.sale_id = s.id
    WHERE s.status IN ('COMPLETED', 'PARTIALLY_REFUNDED')
      AND s.deleted_at IS NULL
      AND s.sale_date BETWEEN ${from} AND ${to}
  `;
  const row = rows[0];
  return { revenueCents: Math.round((row?.total ?? 0) * 100), count: row?.cnt ?? 0 };
}

export const dashboardRouter = createTRPCRouter({
  stats: tenantProcedure.query(async ({ ctx }) => {
    return ctx.withTenant(async (tx) => {
      const now = new Date();
      // Fronteiras ancoradas em BRT (o container roda UTC): sem isso, uma venda
      // de ~21h-24h BRT do dia anterior (que é "hoje" em UTC) aparecia como
      // venda de hoje no painel. Mesmo bug de fuso da auditoria financeira (D6/J3).
      const startOfMonth = startOfMonthBrt(now);
      const startOfDay = startOfTodayBrt(now);
      const startOfPrevMonth = startOfPrevMonthBrt(now);
      const endOfPrevMonth = endOfPrevMonthBrt(now);

      const [
        customersTotal,
        customersMonth,
        customersPrevMonth,
        osOpen,
        osMonth,
        osPrevMonth,
        salesTodayRev,
        salesMonthRev,
        salesPrevMonthRev,
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
        // D2: faturamento com a MESMA definição do DRE (receita de mercadoria por
        // sale_date, COMPLETED+PARTIALLY_REFUNDED), não SUM(totalAmount)/createdAt.
        computePeriodSalesRevenue(tx, startOfDay, now),
        computePeriodSalesRevenue(tx, startOfMonth, now),
        computePeriodSalesRevenue(tx, startOfPrevMonth, endOfPrevMonth),
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

      const salesTodayCount = salesTodayRev.count;
      const salesMonthCount = salesMonthRev.count;
      const salesPrevMonthCount = salesPrevMonthRev.count;
      const salesTodayTotal = salesTodayRev.revenueCents;
      const salesMonthTotal = salesMonthRev.revenueCents;
      const salesPrevMonthTotal = salesPrevMonthRev.revenueCents;
      const ticketMedio = salesMonthCount > 0 ? Math.round(salesMonthTotal / salesMonthCount) : 0;

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
          todayCount: salesTodayCount,
          todayTotal: salesTodayTotal,
          monthCount: salesMonthCount,
          monthTotal: salesMonthTotal,
          previousMonthTotal: salesPrevMonthTotal,
          previousMonthCount: salesPrevMonthCount,
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
        // Janela e agrupamento ancorados em BRT (container roda UTC): senão as
        // barras diárias ficavam deslocadas (venda de 22h BRT caía no dia UTC
        // seguinte). startDate = início (BRT) de N-1 dias atrás.
        const startOfToday = startOfTodayBrt(now);
        const startDate = new Date(startOfToday.getTime() - (input.days - 1) * 24 * 60 * 60 * 1000);

        // G-P1-02: as barras usam a MESMA receita de mercadoria dos cards/DRE
        // (subtotal−desconto−taxa, escalada pela fração mantida; inclui
        // PARTIALLY_REFUNDED), agrupada por DIA BRT de sale_date. Antes somava
        // totalAmount (líquido do trade-in), só COMPLETED, por createdAt → as
        // barras não batiam com o card "Vendas do mês". Espelha computePeriodSalesRevenue.
        const rows = await tx.$queryRaw<Array<{ day: string; total: number | null; cnt: number | null }>>`
          SELECT to_char((s.sale_date AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo'), 'YYYY-MM-DD') AS day,
                 COALESCE(SUM(
                   (GREATEST(s.subtotal - s.discount_amount, 0) - s.operator_fee_amount)
                   * CASE
                       WHEN s.is_os_payment THEN 1
                       WHEN s.subtotal > 0 THEN LEAST(COALESCE(li.live_total, 0) / s.subtotal, 1)
                       ELSE 1
                     END
                 ), 0)::float AS total,
                 COUNT(*)::int AS cnt
          FROM sales s
          LEFT JOIN (
            SELECT sale_id, SUM(total) AS live_total FROM sale_items GROUP BY sale_id
          ) li ON li.sale_id = s.id
          WHERE s.status IN ('COMPLETED', 'PARTIALLY_REFUNDED')
            AND s.deleted_at IS NULL
            AND s.sale_date >= ${startDate}
          GROUP BY 1
        `;
        const byDay = new Map(rows.map((r) => [r.day, r]));

        // Zero-fill de todos os dias da janela (chave YYYY-MM-DD no fuso BRT).
        const result: Array<{ date: string; count: number; totalCents: number }> = [];
        for (let i = 0; i < input.days; i++) {
          const d = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
          const key = brtDayKey(d);
          const row = byDay.get(key);
          result.push({
            date: key,
            count: row?.cnt ?? 0,
            totalCents: Math.round((row?.total ?? 0) * 100),
          });
        }
        return result;
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

  // (dashboard.stockDashboard removido — G-P1-04: procedure órfã (0 consumidores)
  // que subcontava estoque por excluir serializados e ler a coluna currentStock.
  // O dashboard de estoque em uso é stock.stockDashboard, que cobre os 3 tipos
  // via CTE e o saldo efetivo resolvido.)

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
