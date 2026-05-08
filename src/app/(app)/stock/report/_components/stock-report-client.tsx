"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingState } from "@/components/domain/loading-state";
import { useTRPC } from "@/trpc/react";
import { useQuery } from "@tanstack/react-query";

function formatMoney(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function StockReportClient() {
  const trpc = useTRPC();
  const { data, isLoading } = useQuery(trpc.stock.stockReport.queryOptions());

  if (isLoading) return <LoadingState variant="card" />;
  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total de Produtos</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{data.totalProducts}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Valor Total em Estoque</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatMoney(data.totalValue)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Itens com Estoque Baixo</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-destructive">{data.lowStockCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Products table */}
      <div className="rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left p-3 font-medium">Produto</th>
              <th className="text-left p-3 font-medium">SKU</th>
              <th className="text-right p-3 font-medium">Estoque</th>
              <th className="text-right p-3 font-medium">Custo Unit.</th>
              <th className="text-right p-3 font-medium">Valor Total</th>
            </tr>
          </thead>
          <tbody>
            {data.products.map((p) => {
              const isLow = p.currentStock <= p.minStock;
              const totalValue = p.currentStock * Number(p.costPrice);
              return (
                <tr key={p.id} className="border-b last:border-0">
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <span>{p.name}</span>
                      {isLow && <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Baixo</Badge>}
                    </div>
                  </td>
                  <td className="p-3 font-mono text-muted-foreground">{p.sku ?? "—"}</td>
                  <td className="p-3 text-right">{p.currentStock}</td>
                  <td className="p-3 text-right">{formatMoney(Number(p.costPrice))}</td>
                  <td className="p-3 text-right font-medium">{formatMoney(totalValue)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
