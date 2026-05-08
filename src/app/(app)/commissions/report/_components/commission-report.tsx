"use client";

import { useState } from "react";
import { Calculator } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useTRPC } from "@/trpc/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "@/lib/toast";

function formatMoney(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function CommissionReport() {
  const trpc = useTRPC();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());

  const { data: report, refetch } = useQuery(
    trpc.commissions.report.queryOptions({
      periodMonth: month,
      periodYear: year,
    }),
  );

  const calculateMutation = useMutation(
    trpc.commissions.calculate.mutationOptions({
      onSuccess: (result) => {
        toast.success(
          `${result.commissionsCreated} comissão(ões) calculada(s) a partir de ${result.salesProcessed} venda(s) e ${result.serviceOrdersProcessed} OS(s).`,
        );
        void refetch();
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const months = Array.from({ length: 12 }, (_, i) => ({
    value: i + 1,
    label: new Date(2024, i, 1).toLocaleString("pt-BR", { month: "long" }),
  }));

  return (
    <div className="space-y-6">
      {/* Filters + Calculate */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Mês" />
          </SelectTrigger>
          <SelectContent>
            {months.map((m) => (
              <SelectItem key={m.value} value={String(m.value)}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          type="number"
          className="w-[100px]"
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          min={2020}
          max={2100}
        />

        <Button
          onClick={() => calculateMutation.mutate({ periodMonth: month, periodYear: year })}
          disabled={calculateMutation.isPending}
        >
          <Calculator className="h-4 w-4 mr-2" />
          {calculateMutation.isPending ? "Calculando..." : "Calcular Comissões"}
        </Button>
      </div>

      {/* Summary Cards */}
      {report && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Geral</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-primary">{formatMoney(report.grandTotal)}</p>
              <p className="text-xs text-muted-foreground">{report.totalCount} comissões</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Vendas</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{formatMoney(report.totalSale)}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Ordens de Serviço</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{formatMoney(report.totalServiceOrder)}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Colaboradores</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{report.userSummaries.length}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* User Summary Table */}
      {report && report.userSummaries.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Resumo por Colaborador</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Colaborador</TableHead>
                  <TableHead className="text-right">Qtd</TableHead>
                  <TableHead className="text-right">Pendente</TableHead>
                  <TableHead className="text-right">Aprovada</TableHead>
                  <TableHead className="text-right">Paga</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.userSummaries.map((user) => (
                  <TableRow key={user.userId}>
                    <TableCell className="font-medium">{user.userName}</TableCell>
                    <TableCell className="text-right">{user.count}</TableCell>
                    <TableCell className="text-right text-warning">{formatMoney(user.pending)}</TableCell>
                    <TableCell className="text-right text-blue-500">{formatMoney(user.approved)}</TableCell>
                    <TableCell className="text-right text-success">{formatMoney(user.paid)}</TableCell>
                    <TableCell className="text-right font-bold">{formatMoney(user.total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {report && report.userSummaries.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Nenhuma comissão encontrada para este período. Use o botão &ldquo;Calcular Comissões&rdquo; para gerar.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
