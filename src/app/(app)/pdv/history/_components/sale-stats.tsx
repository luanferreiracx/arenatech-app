"use client";
import { formatCentsBRL as formatCurrency } from "@/lib/format";

import { useTRPC } from "@/trpc/react";
import { useQuery } from "@tanstack/react-query";
import { ShoppingCart, DollarSign, Calendar, TrendingUp, BarChart3 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";


export function SaleStats() {
  const trpc = useTRPC();
  const { data: stats } = useQuery(trpc.sale.stats.queryOptions());

  if (!stats) return null;

  const cards = [
    { label: "Vendas Hoje", value: String(stats.todayCount), icon: ShoppingCart },
    { label: "Faturamento Hoje", value: formatCurrency(stats.todayTotal), icon: DollarSign },
    { label: "Vendas no Mes", value: String(stats.monthCount), icon: Calendar },
    { label: "Faturamento Mes", value: formatCurrency(stats.monthTotal), icon: TrendingUp },
    { label: "Ticket Medio", value: formatCurrency(stats.monthAvgTicket), icon: BarChart3 },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <Card key={card.label} className="hover:border-primary/20 transition-colors">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-lg font-bold truncate tabular-nums">
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
