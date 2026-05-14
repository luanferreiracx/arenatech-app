"use client";

import { useState } from "react";
import { useTRPC } from "@/trpc/react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/domain/page-header";
import { Card, CardContent } from "@/components/ui/card";
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

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

export default function ProjectedCashFlowPage() {
  const [days, setDays] = useState(30);
  const trpc = useTRPC();

  const query = useQuery(
    trpc.financial.projectedCashFlow.queryOptions({ days }),
  );

  return (
    <div>
      <PageHeader
        title="Fluxo de Caixa Projetado"
        subtitle={`Proximos ${days} dias — baseado em parcelas pendentes/vencidas`}
        actions={
          <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7 dias</SelectItem>
              <SelectItem value="15">15 dias</SelectItem>
              <SelectItem value="30">30 dias</SelectItem>
              <SelectItem value="60">60 dias</SelectItem>
              <SelectItem value="90">90 dias</SelectItem>
            </SelectContent>
          </Select>
        }
      />

      {query.isLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}
          </div>
          <Skeleton className="h-96" />
        </div>
      ) : query.data ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Card>
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-muted-foreground uppercase">Total a Receber</p>
                <p className="text-xl font-bold text-green-500 font-mono mt-1">
                  {formatCents(query.data.summary.totalReceivable)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-muted-foreground uppercase">Total a Pagar</p>
                <p className="text-xl font-bold text-red-500 font-mono mt-1">
                  {formatCents(query.data.summary.totalPayable)}
                </p>
              </CardContent>
            </Card>
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-primary uppercase">Saldo Projetado</p>
                <p className={`text-xl font-bold font-mono mt-1 ${query.data.summary.projectedBalance >= 0 ? "text-primary" : "text-red-500"}`}>
                  {formatCents(query.data.summary.projectedBalance)}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead className="text-right">A Receber</TableHead>
                      <TableHead className="text-right">A Pagar</TableHead>
                      <TableHead className="text-right">Saldo do Dia</TableHead>
                      <TableHead className="text-right">Saldo Acumulado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {query.data.projection.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground py-10">
                          Nenhum movimento previsto para os proximos {days} dias.
                        </TableCell>
                      </TableRow>
                    ) : (
                      query.data.projection.map((p) => (
                        <TableRow key={p.date}>
                          <TableCell>{formatDate(p.date)}</TableCell>
                          <TableCell className={`text-right font-mono ${p.receivable > 0 ? "text-green-500" : "text-muted-foreground"}`}>
                            {p.receivable > 0 ? formatCents(p.receivable) : "-"}
                          </TableCell>
                          <TableCell className={`text-right font-mono ${p.payable > 0 ? "text-red-500" : "text-muted-foreground"}`}>
                            {p.payable > 0 ? formatCents(p.payable) : "-"}
                          </TableCell>
                          <TableCell className={`text-right font-bold font-mono ${p.dayBalance >= 0 ? "text-green-500" : "text-red-500"}`}>
                            {formatCents(p.dayBalance)}
                          </TableCell>
                          <TableCell className={`text-right font-bold font-mono ${p.cumulativeBalance >= 0 ? "text-primary" : "text-red-500"}`}>
                            {formatCents(p.cumulativeBalance)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
