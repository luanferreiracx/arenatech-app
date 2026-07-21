"use client";

import { useState } from "react";
import { useTRPC } from "@/trpc/react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/inputs/date-input";
import { brtDayKey, todayBrtISO } from "@/lib/utils/date-range";
import { downloadCsv, centsToBrl } from "@/lib/utils/csv-export";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowDownLeft, ArrowUpRight, TrendingUp } from "lucide-react";

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatPeriodLabel(period: string, groupBy: string): string {
  if (groupBy === "month") {
    const [year, month] = period.split("-");
    const months = [
      "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
      "Jul", "Ago", "Set", "Out", "Nov", "Dez",
    ];
    return `${months[parseInt(month!, 10) - 1]}/${year}`;
  }

  // day or week
  const d = new Date(period + "T00:00:00");
  if (groupBy === "week") {
    const endDate = new Date(d);
    endDate.setDate(endDate.getDate() + 6);
    return `${d.toLocaleDateString("pt-BR")} - ${endDate.toLocaleDateString("pt-BR")}`;
  }

  return d.toLocaleDateString("pt-BR");
}

export function CashFlowReport() {
  const trpc = useTRPC();

  // Default: last 30 days
  const today = new Date();
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [dateFrom, setDateFrom] = useState(brtDayKey(thirtyDaysAgo));
  const [dateTo, setDateTo] = useState(todayBrtISO(today));
  const [groupBy, setGroupBy] = useState<"day" | "week" | "month">("day");
  const cashFlowQuery = useQuery(
    trpc.financial.cashFlow.queryOptions(
      { dateFrom, dateTo, groupBy },
    ),
  );

  const data = cashFlowQuery.data;

  const handleExport = () => {
    if (!data) return;
    const rows = data.periods.map((period) => [
      formatPeriodLabel(period.period, groupBy),
      centsToBrl(period.receivable),
      centsToBrl(period.payable),
      centsToBrl(period.balance),
    ]);
    rows.push([
      "TOTAL",
      centsToBrl(data.summary.totalReceivable),
      centsToBrl(data.summary.totalPayable),
      centsToBrl(data.summary.balance),
    ]);
    downloadCsv(
      `fluxo-de-caixa-${dateFrom}-a-${dateTo}.csv`,
      ["Periodo", "Entradas", "Saidas", "Saldo"],
      rows,
    );
  };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <Label>Data Inicial</Label>
              <DateInput
                value={dateFrom}
                onChange={setDateFrom}
                className="w-[160px]"
                aria-label="Data inicial"
              />
            </div>
            <div>
              <Label>Data Final</Label>
              <DateInput
                value={dateTo}
                onChange={setDateTo}
                className="w-[160px]"
                aria-label="Data final"
              />
            </div>
            <div>
              <Label>Agrupar por</Label>
              <Select value={groupBy} onValueChange={(v) => setGroupBy(v as "day" | "week" | "month")}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">Dia</SelectItem>
                  <SelectItem value="week">Semana</SelectItem>
                  <SelectItem value="month">Mes</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="ml-auto">
              <Button
                variant="outline"
                size="sm"
                onClick={handleExport}
                disabled={!data || data.periods.length === 0}
              >
                <Download className="mr-2 h-4 w-4" />
                Exportar CSV
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      {cashFlowQuery.isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : data ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <ArrowDownLeft className="h-8 w-8 text-success" />
                <div>
                  <p className="text-sm text-muted-foreground">Total a Receber</p>
                  <p className="text-xl font-bold font-mono text-success">
                    {formatCents(data.summary.totalReceivable)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <ArrowUpRight className="h-8 w-8 text-destructive" />
                <div>
                  <p className="text-sm text-muted-foreground">Total a Pagar</p>
                  <p className="text-xl font-bold font-mono text-destructive">
                    {formatCents(data.summary.totalPayable)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <TrendingUp className={`h-8 w-8 ${data.summary.balance >= 0 ? "text-success" : "text-destructive"}`} />
                <div>
                  <p className="text-sm text-muted-foreground">Saldo</p>
                  <p className={`text-xl font-bold font-mono ${data.summary.balance >= 0 ? "text-success" : "text-destructive"}`}>
                    {formatCents(data.summary.balance)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* Periods Table */}
      {cashFlowQuery.isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : data && data.periods.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Detalhamento por Periodo
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Periodo</TableHead>
                    <TableHead className="text-right">Entradas</TableHead>
                    <TableHead className="text-right">Saidas</TableHead>
                    <TableHead className="text-right">Saldo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.periods.map((period) => (
                    <TableRow key={period.period}>
                      <TableCell className="font-medium">
                        {formatPeriodLabel(period.period, groupBy)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm text-success">
                        {formatCents(period.receivable)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm text-destructive">
                        {formatCents(period.payable)}
                      </TableCell>
                      <TableCell className={`text-right font-mono text-sm font-medium ${period.balance >= 0 ? "text-success" : "text-destructive"}`}>
                        {formatCents(period.balance)}
                      </TableCell>
                    </TableRow>
                  ))}

                  {/* Total Row */}
                  <TableRow className="bg-muted/50 font-semibold">
                    <TableCell>TOTAL</TableCell>
                    <TableCell className="text-right font-mono text-success">
                      {formatCents(data.summary.totalReceivable)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-destructive">
                      {formatCents(data.summary.totalPayable)}
                    </TableCell>
                    <TableCell className={`text-right font-mono ${data.summary.balance >= 0 ? "text-success" : "text-destructive"}`}>
                      {formatCents(data.summary.balance)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : data ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Nenhuma movimentacao encontrada no periodo selecionado
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
