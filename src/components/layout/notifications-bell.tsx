"use client";
import { formatCentsBRL as formatCurrency } from "@/lib/format";

import Link from "next/link";
import { Bell, AlertTriangle, Clock, Package } from "lucide-react";
import { useTRPC } from "@/trpc/react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";


/**
 * Sino de notificações com contador (auditoria visual 2026-07-12): antes o Bell
 * era uma afordância morta (sem ação nem contagem). Agora reúne os alertas
 * acionáveis do tenant (contas vencidas, OS atrasadas, estoque baixo) num
 * dropdown, com badge de total. Reusa a query `dashboard.alerts`.
 */
export function NotificationsBell() {
  const trpc = useTRPC();
  const { data } = useQuery({
    ...trpc.dashboard.alerts.queryOptions(),
    refetchInterval: 5 * 60 * 1000, // 5 min: alertas mudam devagar
    staleTime: 60 * 1000,
  });

  const overdue = data?.overdueFinancials ?? [];
  const late = data?.lateOrders ?? [];
  const lowStock = data?.lowStock ?? [];
  const total = overdue.length + late.length + lowStock.length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Notificações${total > 0 ? ` (${total})` : ""}`} className="relative">
          <Bell className="h-4 w-4" />
          {total > 0 && (
            <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold tabular-nums leading-none text-destructive-foreground">
              {total > 9 ? "9+" : total}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
          <span className="text-sm font-medium">Notificações</span>
          {total > 0 && (
            <span className="text-xs text-muted-foreground tabular-nums">{total} item(ns)</span>
          )}
        </div>

        {total === 0 ? (
          <div className="px-3 py-8 text-center text-sm text-muted-foreground">
            Tudo em dia. Nenhum alerta.
          </div>
        ) : (
          <div className="max-h-[22rem] overflow-y-auto py-1">
            {overdue.length > 0 && (
              <NotifGroup icon={AlertTriangle} tone="destructive" title={`${overdue.length} ${overdue.length > 1 ? "contas vencidas" : "conta vencida"}`}>
                {overdue.slice(0, 5).map((f) => (
                  <NotifRow key={f.id} href={`/financial/${f.id}`} label={f.description} trailing={formatCurrency(f.totalCents)} trailingTone="destructive" />
                ))}
              </NotifGroup>
            )}
            {late.length > 0 && (
              <NotifGroup icon={Clock} tone="warning" title={`${late.length} ${late.length > 1 ? "OS atrasadas" : "OS atrasada"}`}>
                {late.slice(0, 5).map((o) => (
                  <NotifRow key={o.id} href={`/service-orders/${o.id}`} label={`#${o.number} · ${o.device}`} />
                ))}
              </NotifGroup>
            )}
            {lowStock.length > 0 && (
              <NotifGroup icon={Package} tone="warning" title={`${lowStock.length} ${lowStock.length > 1 ? "produtos com estoque baixo" : "produto com estoque baixo"}`}>
                {lowStock.slice(0, 5).map((p) => (
                  <NotifRow key={p.id} href="/stock" label={p.name} trailing={`${p.currentStock}/${p.minStock}`} />
                ))}
              </NotifGroup>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function NotifGroup({
  icon: Icon,
  tone,
  title,
  children,
}: {
  icon: typeof Bell;
  tone: "destructive" | "warning";
  title: string;
  children: React.ReactNode;
}) {
  const toneClass = tone === "destructive" ? "text-destructive" : "text-warning";
  return (
    <div className="px-1 py-1">
      <p className="flex items-center gap-2 px-2 py-1 text-xs font-medium text-muted-foreground">
        <Icon className={`h-3.5 w-3.5 shrink-0 ${toneClass}`} />
        <span className="min-w-0 truncate">{title}</span>
      </p>
      {children}
    </div>
  );
}

function NotifRow({
  href,
  label,
  trailing,
  trailingTone,
}: {
  href: string;
  label: string;
  trailing?: string;
  trailingTone?: "destructive";
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/60"
    >
      <span className="min-w-0 truncate">{label}</span>
      {trailing && (
        <span className={`shrink-0 text-xs tabular-nums ${trailingTone === "destructive" ? "text-destructive" : "text-muted-foreground"}`}>
          {trailing}
        </span>
      )}
    </Link>
  );
}
