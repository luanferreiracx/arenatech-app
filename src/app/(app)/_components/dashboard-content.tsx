"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Users,
  ClipboardList,
  ShoppingCart,
  AlertTriangle,
  Package,
  DollarSign,
  TrendingUp,
  Calendar,
  Wallet,
  Clock,
  Plus,
  History,
  BarChart3,
  Zap,
  ChevronRight,
} from "lucide-react";
import { useTRPC } from "@/trpc/react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  SERVICE_ORDER_STATUS_LABELS,
  type ServiceOrderStatus,
} from "@/lib/validators/service-order";

/** Map service order status to valid Badge variant */
function statusToBadgeVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "COMPLETED":
    case "PAID":
    case "DELIVERED":
    case "APPROVED":
      return "default";
    case "CANCELLED":
    case "REFUNDED":
      return "destructive";
    case "WAITING_APPROVAL":
    case "WAITING_PARTS":
    case "READY_FOR_PICKUP":
      return "outline";
    default:
      return "secondary";
  }
}

function formatCurrency(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function formatDateTime(date: Date | string): string {
  return new Date(date).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function daysAgo(date: Date | string): number {
  const now = new Date();
  const d = new Date(date);
  return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
}

// ── KPI Cards ──

function KpiCard({
  icon: Icon,
  iconColor,
  label,
  value,
  valueColor,
}: {
  icon: typeof Users;
  iconColor: string;
  label: string;
  value: string | number;
  valueColor?: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-muted">
          <Icon className="h-6 w-6" style={{ color: iconColor }} />
        </div>
        <div className="min-w-0">
          <p className="truncate text-2xl font-bold" style={valueColor ? { color: valueColor } : undefined}>
            {value}
          </p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Cashier Status ──

function CashierStatusBanner() {
  const trpc = useTRPC();
  const { data: cashier, isLoading } = useQuery(trpc.dashboard.cashierStatus.queryOptions());

  if (isLoading) return <Skeleton className="h-20 rounded-lg" />;
  if (!cashier) return null;

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
        <div className="flex items-center gap-3">
          <div
            className={`h-3 w-3 rounded-full ${cashier.isOpen ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" : "bg-red-500"}`}
          />
          <div>
            <p className="font-semibold">Caixa {cashier.isOpen ? "Aberto" : "Fechado"}</p>
            <p className="text-sm text-muted-foreground">
              {cashier.isOpen
                ? `${cashier.salesCount} movimentacoes nesta abertura`
                : "Abra o caixa para iniciar as vendas do dia"}
            </p>
          </div>
        </div>
        {cashier.isOpen && (
          <div className="flex gap-6">
            <div className="text-center">
              <p className="text-xl font-bold">{cashier.salesCount}</p>
              <p className="text-xs text-muted-foreground uppercase">Movimentacoes</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-bold text-green-500">{formatCurrency(cashier.balanceCents)}</p>
              <p className="text-xs text-muted-foreground uppercase">Saldo</p>
            </div>
          </div>
        )}
        <Button variant="outline" size="sm" asChild>
          <Link href="/cashier">{cashier.isOpen ? "Gerenciar Caixa" : "Abrir Caixa"}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

// ── Sales Chart ──

function SalesChart() {
  const [days, setDays] = useState<7 | 30>(7);
  const trpc = useTRPC();
  const { data: chartData, isLoading } = useQuery(trpc.dashboard.salesChart.queryOptions({ days }));

  const maxValue = chartData ? Math.max(...chartData.map((d) => d.totalCents), 1) : 1;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">Vendas por Dia</CardTitle>
        <Tabs value={String(days)} onValueChange={(v) => setDays(Number(v) as 7 | 30)}>
          <TabsList className="h-8">
            <TabsTrigger value="7" className="text-xs px-2 h-6">
              7 dias
            </TabsTrigger>
            <TabsTrigger value="30" className="text-xs px-2 h-6">
              30 dias
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-40" />
        ) : chartData ? (
          <div className="flex items-end gap-1 h-40">
            {chartData.map((d) => {
              const height = maxValue > 0 ? Math.max((d.totalCents / maxValue) * 100, 2) : 2;
              const dateObj = new Date(d.date + "T12:00:00");
              const label = dateObj.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
              return (
                <div key={d.date} className="flex flex-1 flex-col items-center gap-1" title={`${label}: ${formatCurrency(d.totalCents)} (${d.count} vendas)`}>
                  <div
                    className="w-full rounded-t bg-primary transition-all hover:opacity-80"
                    style={{ height: `${height}%`, minHeight: "2px" }}
                  />
                  {days === 7 && (
                    <span className="text-[10px] text-muted-foreground">{label}</span>
                  )}
                </div>
              );
            })}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

// ── Orders by Status ──

function OrdersByStatus() {
  const trpc = useTRPC();
  const { data, isLoading } = useQuery(trpc.dashboard.ordersByStatus.queryOptions());

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">OS por Status</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-32" />
        ) : data && data.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {data.map((item) => (
              <Badge
                key={item.status}
                variant={statusToBadgeVariant(item.status)}
                className="text-xs"
              >
                {SERVICE_ORDER_STATUS_LABELS[item.status as ServiceOrderStatus] ?? item.status}: {item.count}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Nenhuma OS encontrada</p>
        )}
      </CardContent>
    </Card>
  );
}

// ── Recent Tables ──

function RecentSalesTable() {
  const trpc = useTRPC();
  const { data, isLoading } = useQuery(trpc.dashboard.recentSales.queryOptions());

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">Ultimas Vendas</CardTitle>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/pdv" className="text-xs">
            Ver todas <ChevronRight className="ml-1 h-3 w-3" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : data && data.length > 0 ? (
          <div className="space-y-2">
            {data.map((sale) => (
              <div key={sale.id} className="flex items-center justify-between rounded-md border p-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">#{sale.number}</p>
                  <p className="truncate text-xs text-muted-foreground">{sale.itemsSummary || "Sem itens"}</p>
                </div>
                <div className="text-right shrink-0 ml-2">
                  <p className="text-sm font-semibold text-green-600">{formatCurrency(sale.totalCents)}</p>
                  <p className="text-xs text-muted-foreground">{formatDateTime(sale.createdAt)}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Nenhuma venda recente</p>
        )}
      </CardContent>
    </Card>
  );
}

function RecentOrdersTable() {
  const trpc = useTRPC();
  const { data, isLoading } = useQuery(trpc.dashboard.recentOrders.queryOptions());

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">Ultimas OS</CardTitle>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/service-orders" className="text-xs">
            Ver todas <ChevronRight className="ml-1 h-3 w-3" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : data && data.length > 0 ? (
          <div className="space-y-2">
            {data.map((order) => (
              <Link
                key={order.id}
                href={`/service-orders/${order.id}`}
                className="flex items-center justify-between rounded-md border p-2 hover:bg-muted/50 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">#{order.number}</p>
                  <p className="truncate text-xs text-muted-foreground">{order.device}</p>
                </div>
                <div className="text-right shrink-0 ml-2">
                  <Badge
                    variant={statusToBadgeVariant(order.status)}
                    className="text-[10px]"
                  >
                    {SERVICE_ORDER_STATUS_LABELS[order.status as ServiceOrderStatus] ?? order.status}
                  </Badge>
                  <p className="mt-1 text-xs text-muted-foreground">{formatDate(order.createdAt)}</p>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Nenhuma OS recente</p>
        )}
      </CardContent>
    </Card>
  );
}

// ── Alerts ──

function AlertsSection() {
  const trpc = useTRPC();
  const { data: alerts, isLoading } = useQuery(trpc.dashboard.alerts.queryOptions());

  if (isLoading) return <Skeleton className="h-32 rounded-lg" />;
  if (!alerts) return null;

  const hasAlerts = alerts.lowStock.length > 0 || alerts.overdueFinancials.length > 0 || alerts.lateOrders.length > 0;
  if (!hasAlerts) return null;

  return (
    <div className="space-y-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold uppercase text-muted-foreground tracking-wide">
        <AlertTriangle className="h-4 w-4" />
        Alertas
      </h2>

      {alerts.lateOrders.length > 0 && (
        <Card className="border-yellow-500/30 bg-yellow-500/5">
          <CardContent className="p-4">
            <p className="mb-2 text-sm font-medium text-yellow-600">
              {alerts.lateOrders.length} OS atrasada{alerts.lateOrders.length > 1 ? "s" : ""} (mais de 7 dias)
            </p>
            <div className="space-y-1">
              {alerts.lateOrders.map((o) => (
                <Link
                  key={o.id}
                  href={`/service-orders/${o.id}`}
                  className="flex items-center justify-between text-sm hover:underline"
                >
                  <span>
                    #{o.number} - {o.device}
                  </span>
                  <span className="text-xs text-muted-foreground">{daysAgo(o.entryDate)} dias</span>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {alerts.overdueFinancials.length > 0 && (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardContent className="p-4">
            <p className="mb-2 text-sm font-medium text-red-600">
              {alerts.overdueFinancials.length} conta{alerts.overdueFinancials.length > 1 ? "s" : ""} vencida{alerts.overdueFinancials.length > 1 ? "s" : ""}
            </p>
            <div className="space-y-1">
              {alerts.overdueFinancials.map((f) => (
                <Link
                  key={f.id}
                  href={`/financial/${f.id}`}
                  className="flex items-center justify-between text-sm hover:underline"
                >
                  <span className="truncate">{f.description}{f.customerName ? ` - ${f.customerName}` : ""}</span>
                  <span className="shrink-0 ml-2 text-xs font-medium text-red-600">{formatCurrency(f.totalCents)}</span>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {alerts.lowStock.length > 0 && (
        <Card className="border-orange-500/30 bg-orange-500/5">
          <CardContent className="p-4">
            <p className="mb-2 text-sm font-medium text-orange-600">
              {alerts.lowStock.length} produto{alerts.lowStock.length > 1 ? "s" : ""} com estoque baixo
            </p>
            <div className="space-y-1">
              {alerts.lowStock.map((p) => (
                <div key={p.id} className="flex items-center justify-between text-sm">
                  <span className="truncate">{p.name}</span>
                  <span className="shrink-0 ml-2 text-xs">
                    {p.currentStock}/{p.minStock} un
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Quick Links ──

function QuickLinks() {
  const links = [
    { href: "/pdv?novo=1", label: "Nova Venda", icon: ShoppingCart, color: "text-primary" },
    { href: "/pdv", label: "Historico Vendas", icon: History, color: "text-yellow-600" },
    { href: "/service-orders/new", label: "Nova OS", icon: Plus, color: "text-amber-500" },
    { href: "/service-orders", label: "Ordens de Servico", icon: ClipboardList, color: "text-blue-500" },
    { href: "/stock", label: "Posicao Estoque", icon: Package, color: "text-green-500" },
    { href: "/cashier", label: "Historico Caixas", icon: Clock, color: "text-pink-500" },
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <Zap className="h-4 w-4 text-primary" />
          Acesso Rapido
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-2">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="flex items-center gap-2 rounded-md border border-transparent p-3 text-sm font-medium transition-colors hover:border-primary/30 hover:bg-primary/5"
            >
              <link.icon className={`h-4 w-4 shrink-0 ${link.color}`} />
              {link.label}
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main Dashboard ──

export function DashboardContent({ userName }: { userName: string }) {
  const trpc = useTRPC();
  const { data: stats, isLoading: statsLoading } = useQuery(trpc.dashboard.stats.queryOptions());

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border bg-card p-4 md:p-6">
        <div>
          <h1 className="text-2xl font-semibold">Bem-vindo, {userName}!</h1>
          <p className="text-muted-foreground">Gerencie sua assistencia tecnica de forma simples e eficiente.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/cashier">
              <Wallet className="mr-2 h-4 w-4" />
              Caixa
            </Link>
          </Button>
          <Button size="sm" asChild>
            <Link href="/pdv?novo=1">
              <ShoppingCart className="mr-2 h-4 w-4" />
              Nova Venda
            </Link>
          </Button>
        </div>
      </div>

      {/* Cashier Status */}
      <CashierStatusBanner />

      {/* KPI Section: Vendas */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase text-muted-foreground tracking-wide">
          <ShoppingCart className="h-4 w-4" />
          Vendas
        </h2>
        {statsLoading ? (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-lg" />
            ))}
          </div>
        ) : stats ? (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <KpiCard icon={ShoppingCart} iconColor="#f97316" label="Vendas Hoje" value={stats.sales.todayCount} />
            <KpiCard
              icon={DollarSign}
              iconColor="#22c55e"
              label="Faturamento Hoje"
              value={formatCurrency(stats.sales.todayTotal)}
              valueColor="#22c55e"
            />
            <KpiCard
              icon={Calendar}
              iconColor="#c9a84c"
              label={`Faturamento Mes (${stats.sales.monthCount} vendas)`}
              value={formatCurrency(stats.sales.monthTotal)}
              valueColor="#c9a84c"
            />
            <KpiCard
              icon={TrendingUp}
              iconColor="#a855f7"
              label="Ticket Medio"
              value={formatCurrency(stats.sales.ticketMedio)}
              valueColor="#a855f7"
            />
          </div>
        ) : null}
      </section>

      {/* KPI Section: Operacoes */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase text-muted-foreground tracking-wide">
          <Package className="h-4 w-4" />
          Operacoes
        </h2>
        {statsLoading ? (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-lg" />
            ))}
          </div>
        ) : stats ? (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <KpiCard icon={Users} iconColor="#3b82f6" label="Total Clientes" value={stats.customers.total} />
            <KpiCard
              icon={ClipboardList}
              iconColor="#f97316"
              label="OS Abertas"
              value={stats.serviceOrders.open}
            />
            <KpiCard
              icon={AlertTriangle}
              iconColor="#ef4444"
              label="Contas Vencidas"
              value={stats.financialOverdue}
              valueColor={stats.financialOverdue > 0 ? "#ef4444" : undefined}
            />
            <KpiCard
              icon={Package}
              iconColor="#eab308"
              label="Estoque Baixo"
              value={stats.productsLowStock}
              valueColor={stats.productsLowStock > 0 ? "#eab308" : undefined}
            />
          </div>
        ) : null}
      </section>

      {/* Charts + Status Row */}
      <div className="grid gap-4 md:grid-cols-2">
        <SalesChart />
        <OrdersByStatus />
      </div>

      {/* Recent Sales + Orders */}
      <div className="grid gap-4 md:grid-cols-2">
        <RecentSalesTable />
        <RecentOrdersTable />
      </div>

      {/* Alerts */}
      <AlertsSection />

      {/* Quick Links */}
      <QuickLinks />
    </div>
  );
}
