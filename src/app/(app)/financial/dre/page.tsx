"use client";

import { useState } from "react";
import { useTRPC } from "@/trpc/react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/domain/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { downloadCsv, centsToBrl } from "@/lib/utils/csv-export";
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

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export default function DrePage() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const trpc = useTRPC();

  const dreQuery = useQuery(
    trpc.financial.dre.queryOptions({ year }),
  );

  const years = Array.from({ length: 6 }, (_, i) => currentYear - i);

  const handleExport = () => {
    const dre = dreQuery.data;
    if (!dre) return;
    const rows = dre.months.map((m) => {
      const margin = m.revenue > 0 ? ((m.grossProfit / m.revenue) * 100).toFixed(1) : "0.0";
      return [
        m.monthName,
        centsToBrl(m.revenue),
        centsToBrl(m.partsCost),
        centsToBrl(m.grossProfit),
        margin,
        centsToBrl(m.expenses),
        centsToBrl(m.netProfit),
      ];
    });
    const totalMargin = dre.totals.revenue > 0
      ? ((dre.totals.grossProfit / dre.totals.revenue) * 100).toFixed(1)
      : "0.0";
    rows.push([
      "TOTAL",
      centsToBrl(dre.totals.revenue),
      centsToBrl(dre.totals.partsCost),
      centsToBrl(dre.totals.grossProfit),
      totalMargin,
      centsToBrl(dre.totals.expenses),
      centsToBrl(dre.totals.netProfit),
    ]);
    downloadCsv(
      `dre-${year}.csv`,
      ["Mes", "Receita", "Custo Pecas", "Lucro Bruto", "Margem %", "Despesas", "Lucro Liquido"],
      rows,
    );
  };

  return (
    <div>
      <PageHeader
        title="DRE"
        subtitle="Demonstracao de Resultados do Exercicio — consolidado mensal"
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              disabled={!dreQuery.data}
            >
              <Download className="mr-2 h-4 w-4" />
              Exportar CSV
            </Button>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      />

      {dreQuery.isLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
          <Skeleton className="h-96" />
        </div>
      ) : dreQuery.data ? (
        <div className="space-y-6">
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <Card>
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Receita</p>
                <p className="text-lg font-bold text-success font-mono mt-1">
                  {formatCents(dreQuery.data.totals.revenue)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Custo das Pecas</p>
                <p className="text-lg font-bold text-warning font-mono mt-1">
                  {formatCents(dreQuery.data.totals.partsCost)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Lucro Bruto</p>
                <p className="text-lg font-bold text-info font-mono mt-1">
                  {formatCents(dreQuery.data.totals.grossProfit)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Despesas</p>
                <p className="text-lg font-bold text-destructive font-mono mt-1">
                  {formatCents(dreQuery.data.totals.expenses)}
                </p>
              </CardContent>
            </Card>
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-primary uppercase tracking-wide">Lucro Liquido</p>
                <p className={`text-lg font-bold font-mono mt-1 ${dreQuery.data.totals.netProfit >= 0 ? "text-primary" : "text-destructive"}`}>
                  {formatCents(dreQuery.data.totals.netProfit)}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Monthly table */}
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Mes</TableHead>
                      <TableHead className="text-right">Receita</TableHead>
                      <TableHead className="text-right">Custo Pecas</TableHead>
                      <TableHead className="text-right">Lucro Bruto</TableHead>
                      <TableHead className="text-right">Margem %</TableHead>
                      <TableHead className="text-right">Despesas</TableHead>
                      <TableHead className="text-right">Lucro Liquido</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dreQuery.data.months.map((m) => {
                      const margin = m.revenue > 0 ? (m.grossProfit / m.revenue) * 100 : 0;
                      return (
                        <TableRow key={m.month}>
                          <TableCell className="capitalize">{m.monthName}</TableCell>
                          <TableCell className="text-right text-success font-mono">
                            {formatCents(m.revenue)}
                          </TableCell>
                          <TableCell className="text-right text-warning font-mono">
                            {formatCents(m.partsCost)}
                          </TableCell>
                          <TableCell className="text-right text-info font-bold font-mono">
                            {formatCents(m.grossProfit)}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {margin.toFixed(1)}%
                          </TableCell>
                          <TableCell className="text-right text-destructive font-mono">
                            {formatCents(m.expenses)}
                          </TableCell>
                          <TableCell className={`text-right font-bold font-mono ${m.netProfit >= 0 ? "text-primary" : "text-destructive"}`}>
                            {formatCents(m.netProfit)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {/* Total row */}
                    <TableRow className="border-t-2 font-bold">
                      <TableCell>TOTAL</TableCell>
                      <TableCell className="text-right text-success font-mono">
                        {formatCents(dreQuery.data.totals.revenue)}
                      </TableCell>
                      <TableCell className="text-right text-warning font-mono">
                        {formatCents(dreQuery.data.totals.partsCost)}
                      </TableCell>
                      <TableCell className="text-right text-info font-mono">
                        {formatCents(dreQuery.data.totals.grossProfit)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {dreQuery.data.totals.revenue > 0
                          ? ((dreQuery.data.totals.grossProfit / dreQuery.data.totals.revenue) * 100).toFixed(1)
                          : "0.0"}%
                      </TableCell>
                      <TableCell className="text-right text-destructive font-mono">
                        {formatCents(dreQuery.data.totals.expenses)}
                      </TableCell>
                      <TableCell className={`text-right font-mono ${dreQuery.data.totals.netProfit >= 0 ? "text-primary" : "text-destructive"}`}>
                        {formatCents(dreQuery.data.totals.netProfit)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <div className="rounded-lg border border-info/20 bg-info/10 p-3 text-xs text-info">
            <strong>Notas:</strong> Receita soma recebimentos pagos no periodo.
            Custo das pecas considera movimentacoes de estoque do tipo SALE.
            Despesas somam as parcelas de contas a pagar efetivamente baixadas no periodo.
          </div>
        </div>
      ) : null}
    </div>
  );
}
