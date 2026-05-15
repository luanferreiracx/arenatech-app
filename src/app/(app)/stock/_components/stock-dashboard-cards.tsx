"use client";

import {
  Package, Boxes, DollarSign, AlertTriangle, ShoppingCart, ArrowDownToLine,
  TrendingUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useTRPC } from "@/trpc/react";
import { useQuery } from "@tanstack/react-query";

function formatCurrency(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function StockDashboardCards() {
  const trpc = useTRPC();
  const { data } = useQuery(trpc.stock.stockDashboard.queryOptions());

  if (!data) return null;

  const cards = [
    {
      title: "Valor em Estoque",
      value: formatCurrency(data.totalSaleValue),
      icon: DollarSign,
      color: "text-primary",
    },
    {
      title: "Itens Disponiveis",
      value: data.totalItems.toLocaleString("pt-BR"),
      icon: Boxes,
      color: "text-emerald-500",
    },
    {
      title: "Entradas Hoje",
      value: data.entriesToday,
      icon: ArrowDownToLine,
      color: "text-blue-500",
    },
    {
      title: "Vendas Hoje",
      value: data.vendasHojeQtd,
      sub: data.vendasHojeQtd > 0 ? formatCurrency(data.vendasHojeValor) : undefined,
      icon: ShoppingCart,
      color: "text-amber-500",
    },
    {
      title: "Ticket Medio Hoje",
      value: data.vendasHojeQtd > 0 ? formatCurrency(data.ticketMedio) : "-",
      icon: TrendingUp,
      color: "text-indigo-500",
    },
    {
      title: "Estoque Baixo",
      value: data.lowStockProducts.length,
      icon: AlertTriangle,
      color: "text-destructive",
    },
  ];

  return (
    <div className="space-y-6 mb-6">
      {/* Stats cards */}
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
        {cards.map((card) => (
          <Card key={card.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-medium">{card.title}</CardTitle>
              <card.icon className={`h-3.5 w-3.5 ${card.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold">{card.value}</div>
              {"sub" in card && card.sub && (
                <p className="text-xs text-muted-foreground">{card.sub}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Alerts + Top products row */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Low stock alerts */}
        {data.lowStockProducts.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                Alertas de Estoque Baixo
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produto</TableHead>
                    <TableHead className="text-center">Atual</TableHead>
                    <TableHead className="text-center">Minimo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.lowStockProducts.slice(0, 5).map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="text-sm">{p.name}</TableCell>
                      <TableCell className="text-center text-destructive font-bold">
                        {p.currentStock}
                      </TableCell>
                      <TableCell className="text-center text-muted-foreground">
                        {p.minStock}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Top products this week */}
        {data.topProducts.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Package className="h-4 w-4 text-primary" />
                Top Produtos da Semana
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Produto</TableHead>
                    <TableHead className="text-center">Qtd</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.topProducts.map((p, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-bold text-primary">{i + 1}</TableCell>
                      <TableCell className="text-sm">{p.name}</TableCell>
                      <TableCell className="text-center">{p.qty}</TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {p.total.toLocaleString("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                        })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
