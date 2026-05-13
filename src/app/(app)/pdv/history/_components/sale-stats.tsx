"use client";

import { useTRPC } from "@/trpc/react";
import { useQuery } from "@tanstack/react-query";
import { ShoppingCart, DollarSign, Calendar, TrendingUp, BarChart3 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

function formatCurrency(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function SaleStats() {
  const trpc = useTRPC();
  const { data: stats } = useQuery(trpc.sale.stats.queryOptions());

  if (!stats) return null;

  const cards = [
    {
      label: "Vendas Hoje",
      value: String(stats.todayCount),
      icon: ShoppingCart,
      accent: "bg-primary",
    },
    {
      label: "Faturamento Hoje",
      value: formatCurrency(stats.todayTotal),
      icon: DollarSign,
      accent: "bg-green-500",
      valueClass: "text-green-500",
    },
    {
      label: "Vendas no Mes",
      value: String(stats.monthCount),
      icon: Calendar,
      accent: "bg-primary",
    },
    {
      label: "Faturamento Mes",
      value: formatCurrency(stats.monthTotal),
      icon: TrendingUp,
      accent: "bg-violet-500",
      valueClass: "text-violet-500",
    },
    {
      label: "Ticket Medio",
      value: formatCurrency(stats.monthAvgTicket),
      icon: BarChart3,
      accent: "bg-pink-500",
      valueClass: "text-pink-500",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <Card key={card.label} className="relative overflow-hidden hover:border-primary/20 transition-colors">
            <div className={`absolute left-0 top-0 bottom-0 w-0.5 ${card.accent}`} />
            <CardContent className="p-4 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className={`text-lg font-bold truncate tabular-nums ${card.valueClass ?? ""}`}>
                  {card.value}
                </div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                  {card.label}
                </div>
              </div>
              <Icon className="h-5 w-5 text-muted-foreground/30 shrink-0" />
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
