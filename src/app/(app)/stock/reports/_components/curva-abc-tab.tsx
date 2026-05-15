"use client";

import { useTRPC } from "@/trpc/react";
import { useQuery } from "@tanstack/react-query";
import { LoadingState } from "@/components/domain/loading-state";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter,
} from "@/components/ui/table";
import { formatCurrency, AbcBadge } from "./report-helpers";

interface Props {
  dateFrom: string;
  dateTo: string;
}

export function CurvaAbcTab({ dateFrom, dateTo }: Props) {
  const trpc = useTRPC();
  const { data, isLoading } = useQuery(
    trpc.stock.reportCurvaAbc.queryOptions({ dateFrom, dateTo }),
  );

  if (isLoading) return <LoadingState variant="table" />;
  if (!data) return null;

  return (
    <div className="space-y-4">
      {/* Summary by class */}
      <div className="grid gap-4 md:grid-cols-3 mb-4">
        <Card className="border-emerald-500 border-2">
          <CardContent className="text-center py-4">
            <div className="text-3xl font-bold text-emerald-500">A</div>
            <p className="text-sm text-muted-foreground">{data.counts.A} produtos (80% do valor)</p>
            <p className="text-lg font-semibold">{formatCurrency(data.totals.A)}</p>
          </CardContent>
        </Card>
        <Card className="border-amber-500 border-2">
          <CardContent className="text-center py-4">
            <div className="text-3xl font-bold text-amber-500">B</div>
            <p className="text-sm text-muted-foreground">{data.counts.B} produtos (15% do valor)</p>
            <p className="text-lg font-semibold">{formatCurrency(data.totals.B)}</p>
          </CardContent>
        </Card>
        <Card className="border-muted border-2">
          <CardContent className="text-center py-4">
            <div className="text-3xl font-bold text-muted-foreground">C</div>
            <p className="text-sm text-muted-foreground">{data.counts.C} produtos (5% do valor)</p>
            <p className="text-lg font-semibold">{formatCurrency(data.totals.C)}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Classe</TableHead>
                <TableHead>Produto</TableHead>
                <TableHead className="text-center">Qtd Vendida</TableHead>
                <TableHead className="text-right">Valor Total</TableHead>
                <TableHead className="text-right">% Individual</TableHead>
                <TableHead className="text-right">% Acumulado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.products.map((p) => (
                <TableRow key={p.id}>
                  <TableCell><AbcBadge classe={p.classe} /></TableCell>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell className="text-center">{p.quantity.toLocaleString("pt-BR")}</TableCell>
                  <TableCell className="text-right font-mono">{formatCurrency(p.total)}</TableCell>
                  <TableCell className="text-right">{p.percentual.toFixed(2)}%</TableCell>
                  <TableCell className="text-right">{p.percentualAcumulado.toFixed(2)}%</TableCell>
                </TableRow>
              ))}
              {data.products.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    Nenhuma venda encontrada no periodo
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
            {data.products.length > 0 && (
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={3} className="font-bold">TOTAL</TableCell>
                  <TableCell className="text-right font-bold font-mono">
                    {formatCurrency(data.totalGeral)}
                  </TableCell>
                  <TableCell colSpan={2} className="text-right font-bold">100%</TableCell>
                </TableRow>
              </TableFooter>
            )}
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
