"use client";

import { useTRPC } from "@/trpc/react";
import { useQuery } from "@tanstack/react-query";
import { LoadingState } from "@/components/domain/loading-state";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { formatCurrency, RankBadge } from "./report-helpers";

interface Props {
  dateFrom: string;
  dateTo: string;
}

export function VendasVendedorTab({ dateFrom, dateTo }: Props) {
  const trpc = useTRPC();
  const { data, isLoading } = useQuery(
    trpc.stock.reportVendasVendedor.queryOptions({ dateFrom, dateTo }),
  );

  if (isLoading) return <LoadingState variant="table" />;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3 mb-4">
        <Card className="bg-primary text-primary-foreground">
          <CardContent className="text-center py-4">
            <div className="text-2xl font-bold">{data.totals.quantity}</div>
            <p className="text-sm opacity-80">Total de Vendas</p>
          </CardContent>
        </Card>
        <Card className="bg-emerald-600 text-white">
          <CardContent className="text-center py-4">
            <div className="text-2xl font-bold">{formatCurrency(data.totals.totalAmount)}</div>
            <p className="text-sm opacity-80">Valor Total</p>
          </CardContent>
        </Card>
        <Card className="bg-blue-600 text-white">
          <CardContent className="text-center py-4">
            <div className="text-2xl font-bold">{formatCurrency(data.totals.profit)}</div>
            <p className="text-sm opacity-80">Lucro Bruto Total</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Vendedor</TableHead>
                <TableHead className="text-center">Vendas</TableHead>
                <TableHead className="text-right">Valor Total</TableHead>
                <TableHead className="text-right">Descontos</TableHead>
                <TableHead className="text-right">Ticket Medio</TableHead>
                <TableHead className="text-right">Lucro</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.sellers.map((s, idx) => (
                <TableRow key={s.sellerId}>
                  <TableCell><RankBadge index={idx} /></TableCell>
                  <TableCell className="font-medium">{s.sellerName}</TableCell>
                  <TableCell className="text-center">{s.quantity}</TableCell>
                  <TableCell className="text-right font-mono">{formatCurrency(s.totalAmount)}</TableCell>
                  <TableCell className="text-right font-mono text-amber-500">
                    {formatCurrency(s.discountAmount)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(s.ticketMedio)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-emerald-500">
                    {formatCurrency(s.profit)}
                  </TableCell>
                </TableRow>
              ))}
              {data.sellers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    Nenhuma venda encontrada
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
