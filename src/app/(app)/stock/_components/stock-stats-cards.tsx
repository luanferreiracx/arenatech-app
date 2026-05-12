"use client";

import { Package, Boxes, DollarSign, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTRPC } from "@/trpc/react";
import { useQuery } from "@tanstack/react-query";

export function StockStatsCards() {
  const trpc = useTRPC();
  const { data } = useQuery(trpc.stock.stats.queryOptions());

  const cards = [
    {
      title: "Produtos Cadastrados",
      value: data?.totalProducts ?? 0,
      icon: Package,
      color: "text-blue-500",
    },
    {
      title: "Itens em Estoque",
      value: data?.totalItems ?? 0,
      icon: Boxes,
      color: "text-emerald-500",
    },
    {
      title: "Valor em Estoque",
      value: (data?.totalSaleValue ?? 0).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
      }),
      icon: DollarSign,
      color: "text-primary",
    },
    {
      title: "Estoque Baixo",
      value: data?.lowStockCount ?? 0,
      icon: AlertTriangle,
      color: "text-destructive",
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
      {cards.map((card) => (
        <Card key={card.title}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
            <card.icon className={`h-4 w-4 ${card.color}`} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{card.value}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
