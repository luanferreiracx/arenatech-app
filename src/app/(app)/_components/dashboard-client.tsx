"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Wrench, ShoppingCart, Users, DollarSign } from "lucide-react";
import { useTRPC } from "@/trpc/react";
import { useQuery } from "@tanstack/react-query";

function formatMoney(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function DashboardClient() {
  const trpc = useTRPC();
  const { data, isLoading } = useQuery(trpc.dashboard.stats.queryOptions());

  const cards = [
    {
      title: "Ordens Abertas",
      value: data?.openOrders,
      icon: Wrench,
    },
    {
      title: "Vendas Hoje",
      value: data?.todaySales,
      icon: ShoppingCart,
    },
    {
      title: "Clientes",
      value: data?.customerCount,
      icon: Users,
    },
    {
      title: "Faturamento do Mes",
      value: data ? formatMoney(data.monthRevenue) : undefined,
      icon: DollarSign,
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.title}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {card.title}
            </CardTitle>
            <card.icon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : (
              <p className="text-2xl font-bold">{card.value ?? "0"}</p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
