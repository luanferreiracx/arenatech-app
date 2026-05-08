"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DateRangePicker } from "@/components/inputs/date-range-picker";
import { LoadingState } from "@/components/domain/loading-state";
import { useTRPC } from "@/trpc/react";
import { useQuery } from "@tanstack/react-query";
import type { DateRange } from "react-day-picker";

function formatMoney(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function CashFlowClient() {
  const trpc = useTRPC();
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  const [dateRange, setDateRange] = useState<DateRange>({
    from: startOfMonth,
    to: endOfMonth,
  });
  const [groupBy, setGroupBy] = useState<"day" | "week" | "month">("day");

  const { data, isLoading } = useQuery(
    trpc.financial.cashFlowReport.queryOptions({
      from: dateRange.from ?? startOfMonth,
      to: dateRange.to ?? endOfMonth,
      groupBy,
    }),
  );

  const { data: overdue } = useQuery(
    trpc.financial.overdueReport.queryOptions(),
  );

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <DateRangePicker
          value={dateRange}
          onChange={(range) => { if (range) setDateRange(range); }}
        />
        <Select value={groupBy} onValueChange={(v) => setGroupBy(v as "day" | "week" | "month")}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="day">Por dia</SelectItem>
            <SelectItem value="week">Por semana</SelectItem>
            <SelectItem value="month">Por mês</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <LoadingState variant="card" />
      ) : data ? (
        <>
          {/* Summary */}
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Total Receitas</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-success">{formatMoney(data.totalReceivable)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Total Despesas</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-destructive">{formatMoney(data.totalPayable)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Saldo</CardTitle>
              </CardHeader>
              <CardContent>
                <p className={`text-2xl font-bold ${data.totalBalance >= 0 ? "text-success" : "text-destructive"}`}>
                  {formatMoney(data.totalBalance)}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Periods table */}
          {data.periods.length > 0 && (
            <div className="rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-3 font-medium">Período</th>
                    <th className="text-right p-3 font-medium">Receitas</th>
                    <th className="text-right p-3 font-medium">Despesas</th>
                    <th className="text-right p-3 font-medium">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {data.periods.map((p) => (
                    <tr key={p.period} className="border-b last:border-0">
                      <td className="p-3 font-mono">{p.period}</td>
                      <td className="p-3 text-right text-success">{formatMoney(p.receivable)}</td>
                      <td className="p-3 text-right text-destructive">{formatMoney(p.payable)}</td>
                      <td className={`p-3 text-right font-medium ${p.balance >= 0 ? "text-success" : "text-destructive"}`}>
                        {formatMoney(p.balance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}

      {/* Overdue section */}
      {overdue && overdue.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-destructive">Vencidos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {overdue.map((t) => (
                <div key={t.id} className="flex items-center justify-between p-2 rounded-md border border-destructive/20">
                  <div>
                    <p className="font-medium">{t.description}</p>
                    <p className="text-xs text-muted-foreground">
                      Vencido em {new Date(t.dueDate).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-destructive">{formatMoney(Number(t.totalAmount))}</p>
                    <Badge variant="outline" className="text-xs">
                      {t.type === "PAYABLE" ? "A Pagar" : "A Receber"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
