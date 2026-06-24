"use client";

import { useTRPC } from "@/trpc/react";
import { useQuery } from "@tanstack/react-query";
import {
  ClipboardList,
  Wrench,
  CheckCircle2,
  Package,
} from "lucide-react";

export function ServiceOrderStats() {
  const trpc = useTRPC();
  const statsQuery = useQuery(trpc.serviceOrder.stats.queryOptions());
  const stats = statsQuery.data;

  if (!stats) return null;

  const cards = [
    {
      label: "Abertas",
      value: stats.open,
      icon: ClipboardList,
      className: "text-blue-500",
    },
    {
      label: "Em Andamento",
      value: stats.inProgress,
      icon: Wrench,
      className: "text-primary",
    },
    {
      label: "Concluidas",
      value: stats.completed,
      icon: CheckCircle2,
      className: "text-success",
    },
    {
      label: "Aguardando Retirada",
      value: stats.readyForPickup,
      icon: Package,
      className: "text-warning",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div
            key={card.label}
            className="rounded-lg border border-border bg-card p-4"
          >
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{card.label}</p>
              <Icon className={`h-5 w-5 ${card.className}`} />
            </div>
            <p className={`text-2xl font-bold mt-1 ${card.className}`}>
              {card.value}
            </p>
          </div>
        );
      })}
    </div>
  );
}
