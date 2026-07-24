"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { formatCentsBRL as formatCurrency } from "@/lib/format";
import { useSearchParams } from "next/navigation";
import { toast } from "@/lib/toast";
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
  Zap,
  ChevronRight,
  Smartphone,
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

// ── KPI ──

/**
 * Métrica compacta. Estratégia Restrained: sem cor decorativa no ícone; o
 * `tone` só destaca quando o número CARREGA um significado de estado (positivo
 * = dinheiro entrando, alerta = pendência que exige ação). Neutro é o padrão.
 */
function Kpi({
  icon: Icon,
  label,
  value,
  tone = "neutral",
  href,
}: {
  icon: typeof Users;
  label: string;
  value: string | number;
  tone?: "neutral" | "positive" | "alert";
  href?: string;
}) {
  const valueClass =
    tone === "positive" ? "text-success" : tone === "alert" ? "text-destructive" : "text-foreground";
  const body = (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4 shrink-0" />
        <span className="truncate text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className={`truncate text-2xl font-semibold tracking-tight tabular-nums ${valueClass}`}>{value}</p>
    </div>
  );
  const base =
    "rounded-xl border border-border bg-card px-4 py-3.5 transition-colors";
  if (href) {
    return (
      <Link href={href} className={`${base} block hover:border-primary/40 hover:bg-primary/5`}>
        {body}
      </Link>
    );
  }
  return <div className={base}>{body}</div>;
}

// ── Cashier Status ──

function CashierStatusBanner() {
  const trpc = useTRPC();
  const { data: cashier, isLoading } = useQuery(trpc.dashboard.cashierStatus.queryOptions());

  if (isLoading) return <Skeleton className="h-16 rounded-xl" />;
  if (!cashier) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card px-4 py-3">
      <div className="flex items-center gap-3">
        <span
          className={`h-2.5 w-2.5 shrink-0 rounded-full ${cashier.isOpen ? "bg-success shadow-[0_0_0_3px_var(--color-success)]/20" : "bg-destructive"}`}
          aria-hidden
        />
        <div className="min-w-0">
          <p className="font-medium">Caixa {cashier.isOpen ? "aberto" : "fechado"}</p>
          <p className="truncate text-sm text-muted-foreground">
            {cashier.isOpen
              ? `${cashier.salesCount} movimentações nesta abertura`
              : "Abra o caixa para iniciar as vendas do dia"}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-6">
        {cashier.isOpen && (
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-semibold tabular-nums text-success">
              {formatCurrency(cashier.balanceCents)}
            </span>
            <span className="text-xs uppercase tracking-wide text-muted-foreground">em caixa</span>
          </div>
        )}
        <Button variant={cashier.isOpen ? "outline" : "default"} size="sm" asChild>
          <Link href="/cashier">{cashier.isOpen ? "Gerenciar" : "Abrir caixa"}</Link>
        </Button>
      </div>
    </div>
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
        ) : chartData && chartData.length > 0 ? (
          <div className="flex items-end gap-1">
            {chartData.map((d) => {
              // Altura proporcional ao maior dia (em %). A area das barras tem
              // altura FIXA (h-40) e o `height` percentual e resolvido contra
              // ela — por isso a barra fica num wrapper proprio de altura fixa,
              // separado do label (que fica fora do calculo de %).
              const height = maxValue > 0 ? Math.max((d.totalCents / maxValue) * 100, 2) : 2;
              const dateObj = new Date(d.date + "T12:00:00");
              const label = dateObj.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
              return (
                <div
                  key={d.date}
                  className="flex flex-1 flex-col items-center gap-1"
                  title={`${label}: ${formatCurrency(d.totalCents)} (${d.count} vendas)`}
                >
                  <div className="flex h-40 w-full items-end">
                    <div
                      className="w-full rounded-t bg-primary transition-all hover:opacity-80"
                      style={{ height: `${height}%`, minHeight: "2px" }}
                    />
                  </div>
                  {days === 7 && (
                    <span className="text-[10px] text-muted-foreground">{label}</span>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
            Sem vendas no periodo
          </div>
        )}
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
                  <p className="text-sm font-semibold tabular-nums text-success">{formatCurrency(sale.totalCents)}</p>
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
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <AlertTriangle className="h-3.5 w-3.5 text-warning" />
        Requer atenção
      </h2>
      {/* Painel único, colunas por gravidade. Sem card por alerta: o tom do
          título (destructive p/ dinheiro, warning p/ operação) carrega o estado. */}
      <div className="grid gap-3 lg:grid-cols-3">
        {alerts.overdueFinancials.length > 0 && (
          <AlertGroup
            tone="destructive"
            title={`${alerts.overdueFinancials.length} ${alerts.overdueFinancials.length > 1 ? "contas vencidas" : "conta vencida"}`}
          >
            {alerts.overdueFinancials.map((f) => (
              <Link key={f.id} href={`/financial/${f.id}`} className="flex items-center justify-between gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-muted/50">
                <span className="min-w-0 truncate">{f.description}{f.customerName ? ` · ${f.customerName}` : ""}</span>
                <span className="shrink-0 text-xs font-medium tabular-nums text-destructive">{formatCurrency(f.totalCents)}</span>
              </Link>
            ))}
          </AlertGroup>
        )}

        {alerts.lateOrders.length > 0 && (
          <AlertGroup
            tone="warning"
            title={`${alerts.lateOrders.length} ${alerts.lateOrders.length > 1 ? "OS atrasadas" : "OS atrasada"}`}
          >
            {alerts.lateOrders.map((o) => (
              <Link key={o.id} href={`/service-orders/${o.id}`} className="flex items-center justify-between gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-muted/50">
                <span className="min-w-0 truncate">#{o.number} · {o.device}</span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{daysAgo(o.entryDate)}d</span>
              </Link>
            ))}
          </AlertGroup>
        )}

        {alerts.lowStock.length > 0 && (
          <AlertGroup
            tone="warning"
            title={`${alerts.lowStock.length} ${alerts.lowStock.length > 1 ? "produtos com estoque baixo" : "produto com estoque baixo"}`}
          >
            {alerts.lowStock.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-2 px-1.5 py-1 text-sm">
                <span className="min-w-0 truncate">{p.name}</span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{p.currentStock}/{p.minStock}</span>
              </div>
            ))}
          </AlertGroup>
        )}
      </div>
    </section>
  );
}

function AlertGroup({
  tone,
  title,
  children,
}: {
  tone: "destructive" | "warning";
  title: string;
  children: React.ReactNode;
}) {
  const dot = tone === "destructive" ? "bg-destructive" : "bg-warning";
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="mb-1.5 flex items-center gap-2 px-1.5 text-sm font-medium">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} aria-hidden />
        <span className="min-w-0 truncate">{title}</span>
      </p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

// ── Quick Links ──

function QuickLinks({ tenantSlug, allowedModules }: { tenantSlug?: string; allowedModules?: string[] }) {
  const has = (mod: string) => (allowedModules ?? []).includes(mod);
  const links = [
    { href: "/pdv?novo=1", label: "Nova venda", icon: ShoppingCart, mod: "pdv" },
    { href: "/pdv/history", label: "Histórico de vendas", icon: History, mod: "pdv" },
    { href: "/service-orders/new", label: "Nova OS", icon: Plus, mod: "service-orders" },
    { href: "/service-orders", label: "Ordens de serviço", icon: ClipboardList, mod: "service-orders" },
    { href: "/stock", label: "Posição de estoque", icon: Package, mod: "stock" },
    { href: "/cashier", label: "Caixa", icon: Clock, mod: "cashier" },
    { href: "/depix-wallet", label: "Carteira DePix", icon: Wallet, mod: "wallet" },
    ...(tenantSlug === "arena-tech"
      ? [{ href: "/iphone-hunter", label: "Buscar iPhones", icon: Smartphone, mod: "stock" }]
      : []),
  ].filter((l) => has(l.mod) || (l.href === "/iphone-hunter" && tenantSlug === "arena-tech"));

  if (links.length === 0) return null;

  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Zap className="h-3.5 w-3.5 text-primary" />
        Acesso rápido
      </h2>
      {/* Ícone monocromático (herda cor no hover): sem rainbow. Grid denso. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="group flex items-center gap-2.5 rounded-xl border border-border bg-card px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:border-primary/40 focus-visible:bg-primary/5"
          >
            <link.icon className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
            <span className="truncate leading-tight">{link.label}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

// ── Main Dashboard ──

export function DashboardContent({
  userName,
  tenantSlug,
  allowedModules,
}: {
  userName: string;
  tenantSlug?: string;
  allowedModules?: string[];
}) {
  const trpc = useTRPC();
  const { data: stats, isLoading: statsLoading } = useQuery(trpc.dashboard.stats.queryOptions());
  const has = (mod: string) => (allowedModules ?? []).includes(mod);

  // Aviso quando o usuário foi redirecionado para cá por tentar acessar um
  // módulo não liberado no plano (gating no proxy).
  const searchParams = useSearchParams();
  useEffect(() => {
    if (searchParams.get("error") === "modulo-indisponivel") {
      toast.error("Modulo nao disponivel no seu plano.");
    }
  }, [searchParams]);

  const firstName = userName?.split(" ")[0] ?? userName;

  return (
    <div className="space-y-8">
      {/* Cabeçalho — saudação + ação primária. Sem card: é o título da página. */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">Olá, {firstName}</h1>
          <p className="text-sm text-muted-foreground">Visão geral da sua operação hoje.</p>
        </div>
        <div className="flex gap-2">
          {has("cashier") && (
            <Button variant="outline" size="sm" asChild>
              <Link href="/cashier">
                <Wallet className="mr-2 h-4 w-4" />
                Caixa
              </Link>
            </Button>
          )}
          {has("pdv") && (
            <Button size="sm" asChild>
              <Link href="/pdv?novo=1">
                <ShoppingCart className="mr-2 h-4 w-4" />
                Nova venda
              </Link>
            </Button>
          )}
          {!has("pdv") && has("wallet") && (
            <Button size="sm" asChild>
              <Link href="/depix-wallet">
                <Wallet className="mr-2 h-4 w-4" />
                Carteira DePix
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Status do caixa — faixa fina, primeira coisa que o operador confere. */}
      <CashierStatusBanner />

      {/* Métricas — um único grid coeso (não seções fragmentadas em cards). O
          significado vem do `tone`, não de 8 cores aleatórias. */}
      {statsLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-[4.75rem] rounded-xl" />
          ))}
        </div>
      ) : stats ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <Kpi
            icon={DollarSign}
            label="Faturamento hoje"
            value={formatCurrency(stats.sales.todayTotal)}
            tone="positive"
          />
          <Kpi icon={ShoppingCart} label="Vendas hoje" value={stats.sales.todayCount} />
          <Kpi icon={TrendingUp} label="Ticket médio" value={formatCurrency(stats.sales.ticketMedio)} />
          <Kpi
            icon={Calendar}
            label={`Faturamento mês (${stats.sales.monthCount})`}
            value={formatCurrency(stats.sales.monthTotal)}
          />
          <Kpi
            icon={ClipboardList}
            label="OS abertas"
            value={stats.serviceOrders.open}
            href={has("service-orders") ? "/service-orders" : undefined}
          />
          <Kpi
            icon={Users}
            label="Clientes"
            value={stats.customers.total}
            href={has("customers") ? "/customers" : undefined}
          />
          <Kpi
            icon={AlertTriangle}
            label="Contas vencidas"
            value={stats.financialOverdue}
            tone={stats.financialOverdue > 0 ? "alert" : "neutral"}
            href={has("financial") ? "/financial/pending" : undefined}
          />
          <Kpi
            icon={Package}
            label="Estoque baixo"
            value={stats.productsLowStock}
            tone={stats.productsLowStock > 0 ? "alert" : "neutral"}
            href={has("stock") ? "/stock" : undefined}
          />
        </div>
      ) : null}

      {/* Acesso rápido — o que se faz todo dia, a um clique. */}
      <QuickLinks tenantSlug={tenantSlug} allowedModules={allowedModules} />

      {/* Alertas acionáveis (só renderiza se houver). */}
      <AlertsSection />

      {/* Gráfico + status de OS. */}
      <div className="grid gap-4 lg:grid-cols-2">
        <SalesChart />
        <OrdersByStatus />
      </div>

      {/* Atividade recente. */}
      <div className="grid gap-4 lg:grid-cols-2">
        <RecentSalesTable />
        <RecentOrdersTable />
      </div>
    </div>
  );
}
