"use client";

import { useTRPC } from "@/trpc/react";
import { useQuery } from "@tanstack/react-query";
import { useIsTenantAdmin } from "@/lib/auth/use-tenant-admin";
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

export function VendasProdutoTab({ dateFrom, dateTo }: Props) {
  const trpc = useTRPC();
  const isAdmin = useIsTenantAdmin();
  const { data, isLoading } = useQuery(
    trpc.stock.reportVendasProduto.queryOptions({ dateFrom, dateTo }),
  );

  if (isLoading) return <LoadingState variant="table" />;
  if (!data) return null;

  // Lucro/custo só para admin (A3) — o backend retorna null para operador.
  const showProfit = isAdmin && data.totals.profit !== null;

  return (
    <div className="space-y-4">
      <div className={`grid gap-4 mb-4 ${showProfit ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
        <Card className="bg-primary text-primary-foreground">
          <CardContent className="text-center py-4">
            <div className="text-2xl font-bold">{data.totals.quantity.toLocaleString("pt-BR")}</div>
            <p className="text-sm opacity-80">Unidades Vendidas</p>
          </CardContent>
        </Card>
        <Card className="bg-emerald-600 text-white">
          <CardContent className="text-center py-4">
            <div className="text-2xl font-bold">{formatCurrency(data.totals.totalAmount)}</div>
            <p className="text-sm opacity-80">Valor Total</p>
          </CardContent>
        </Card>
        {showProfit && (
          <Card className="bg-blue-600 text-white">
            <CardContent className="text-center py-4">
              <div className="text-2xl font-bold">{formatCurrency(data.totals.profit ?? 0)}</div>
              <p className="text-sm opacity-80">Lucro Bruto</p>
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Produto</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead className="text-center">Vendas</TableHead>
                <TableHead className="text-center">Qtd</TableHead>
                <TableHead className="text-right">Valor Total</TableHead>
                {showProfit && <TableHead className="text-right">Lucro</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.products.map((p, idx) => (
                <TableRow key={p.id}>
                  <TableCell><RankBadge index={idx} /></TableCell>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell className="text-muted-foreground">{p.category ?? "-"}</TableCell>
                  <TableCell className="text-center">{p.numSales}</TableCell>
                  <TableCell className="text-center">{p.quantity.toLocaleString("pt-BR")}</TableCell>
                  <TableCell className="text-right font-mono">{formatCurrency(p.totalAmount)}</TableCell>
                  {showProfit && (
                    <TableCell className="text-right font-mono text-emerald-500">
                      {formatCurrency(p.profit ?? 0)}
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {data.products.length === 0 && (
                <TableRow>
                  <TableCell colSpan={showProfit ? 7 : 6} className="text-center text-muted-foreground py-8">
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
