"use client";

import { Users, ClipboardList, ShoppingCart, AlertTriangle, Package, DollarSign } from "lucide-react";
import { useTRPC } from "@/trpc/react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function formatCurrency(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function DashboardContent({ userName }: { userName: string }) {
  const trpc = useTRPC();
  const statsQuery = useQuery(trpc.dashboard.stats.queryOptions());
  const stats = statsQuery.data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-muted-foreground">Bem-vindo, {userName}.</p>
      </div>

      {stats ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <Users className="h-8 w-8 text-blue-500" />
              <div>
                <p className="text-2xl font-bold">{stats.customers.total}</p>
                <p className="text-xs text-muted-foreground">Clientes ({stats.customers.month} este mes)</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <ClipboardList className="h-8 w-8 text-primary" />
              <div>
                <p className="text-2xl font-bold">{stats.serviceOrders.open}</p>
                <p className="text-xs text-muted-foreground">OS Abertas ({stats.serviceOrders.month} este mes)</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <ShoppingCart className="h-8 w-8 text-green-500" />
              <div>
                <p className="text-2xl font-bold">{formatCurrency(stats.sales.todayTotal)}</p>
                <p className="text-xs text-muted-foreground">Vendas Hoje ({stats.sales.todayCount})</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <DollarSign className="h-8 w-8 text-primary" />
              <div>
                <p className="text-2xl font-bold">{formatCurrency(stats.sales.monthTotal)}</p>
                <p className="text-xs text-muted-foreground">Vendas Mes ({stats.sales.monthCount})</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <AlertTriangle className="h-8 w-8 text-red-500" />
              <div>
                <p className="text-2xl font-bold">{stats.financialOverdue}</p>
                <p className="text-xs text-muted-foreground">Contas Vencidas</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <Package className="h-8 w-8 text-yellow-500" />
              <div>
                <p className="text-2xl font-bold">{stats.productsLowStock}</p>
                <p className="text-xs text-muted-foreground">Estoque Baixo</p>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
        </div>
      )}
    </div>
  );
}
