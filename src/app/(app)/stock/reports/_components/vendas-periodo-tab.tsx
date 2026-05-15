"use client";

import { useState } from "react";
import { useTRPC } from "@/trpc/react";
import { useQuery } from "@tanstack/react-query";
import { LoadingState } from "@/components/domain/loading-state";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { formatCurrency, formatDateTime } from "./report-helpers";

interface Props {
  dateFrom: string;
  dateTo: string;
}

export function VendasPeriodoTab({ dateFrom, dateTo }: Props) {
  const [sellerId, setSellerId] = useState("");

  const trpc = useTRPC();
  const { data: sellers } = useQuery(trpc.stock.listSellers.queryOptions());
  const { data, isLoading } = useQuery(
    trpc.stock.reportVendasPeriodo.queryOptions({
      dateFrom,
      dateTo,
      sellerId: sellerId || undefined,
    }),
  );

  if (isLoading) return <LoadingState variant="table" />;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Vendedor</label>
              <select
                className="border rounded-md px-3 py-2 text-sm bg-background min-w-[200px]"
                value={sellerId}
                onChange={(e) => setSellerId(e.target.value)}
              >
                <option value="">Todos</option>
                {sellers?.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-5 mb-4">
        <Card className="bg-primary text-primary-foreground">
          <CardContent className="text-center py-4">
            <div className="text-2xl font-bold">{data.totals.quantity}</div>
            <p className="text-sm opacity-80">Vendas</p>
          </CardContent>
        </Card>
        <Card className="bg-emerald-600 text-white">
          <CardContent className="text-center py-4">
            <div className="text-2xl font-bold">{formatCurrency(data.totals.totalVendido)}</div>
            <p className="text-sm opacity-80">Total Vendido</p>
          </CardContent>
        </Card>
        <Card className="bg-amber-500 text-white">
          <CardContent className="text-center py-4">
            <div className="text-2xl font-bold">{formatCurrency(data.totals.totalDesconto)}</div>
            <p className="text-sm opacity-80">Descontos</p>
          </CardContent>
        </Card>
        <Card className="bg-blue-600 text-white">
          <CardContent className="text-center py-4">
            <div className="text-2xl font-bold">{formatCurrency(data.totals.lucroBruto)}</div>
            <p className="text-sm opacity-80">Lucro Bruto</p>
          </CardContent>
        </Card>
        <Card className="bg-muted">
          <CardContent className="text-center py-4">
            <div className="text-2xl font-bold">{formatCurrency(data.totals.ticketMedio)}</div>
            <p className="text-sm text-muted-foreground">Ticket Medio</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Venda</TableHead>
                <TableHead>Data</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Lucro</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.sales.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">#{s.number}</TableCell>
                  <TableCell>{formatDateTime(s.saleDate)}</TableCell>
                  <TableCell className="text-right font-mono">{formatCurrency(s.totalAmount)}</TableCell>
                  <TableCell className={`text-right font-mono ${s.profit >= 0 ? "text-emerald-500" : "text-destructive"}`}>
                    {formatCurrency(s.profit)}
                  </TableCell>
                </TableRow>
              ))}
              {data.sales.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    Nenhuma venda encontrada no periodo
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
