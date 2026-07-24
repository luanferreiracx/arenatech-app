"use client";
import { formatDecimalBRL as formatCurrency } from "@/lib/format";

import { useTRPC } from "@/trpc/react";
import { useQuery } from "@tanstack/react-query";
import { useIsTenantAdmin } from "@/lib/auth/use-tenant-admin";
import { PageHeader } from "@/components/domain/page-header";
import { LoadingState } from "@/components/domain/loading-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/domain/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Package, Boxes, DollarSign, AlertTriangle, XCircle } from "lucide-react";


export default function StockReportPage() {
  const trpc = useTRPC();
  const isAdmin = useIsTenantAdmin();
  const { data, isLoading } = useQuery(trpc.stock.inventoryReport.queryOptions());

  if (isLoading) {
    return (
      <div>
        <PageHeader title="Relatorio de Inventario" />
        <LoadingState variant="table" />
      </div>
    );
  }

  if (!data) {
    return (
      <div>
        <PageHeader title="Relatorio de Inventario" />
        <p className="text-muted-foreground">Erro ao carregar dados.</p>
      </div>
    );
  }

  const { products, summary } = data;

  const summaryCards = [
    {
      title: "Produtos Ativos",
      value: summary.totalProducts,
      icon: Package,
      color: "text-blue-500",
    },
    {
      title: "Total de Itens",
      value: summary.totalItems,
      icon: Boxes,
      color: "text-emerald-500",
    },
    // Valor de custo só para admin (A3).
    ...(isAdmin && summary.totalCostValue !== null
      ? [
          {
            title: "Valor de Custo",
            value: formatCurrency(summary.totalCostValue),
            icon: DollarSign,
            color: "text-muted-foreground",
          },
        ]
      : []),
    {
      title: "Valor de Venda",
      value: formatCurrency(summary.totalSaleValue),
      icon: DollarSign,
      color: "text-primary",
    },
    {
      title: "Estoque Baixo",
      value: summary.lowStockCount,
      icon: AlertTriangle,
      color: "text-warning",
    },
    {
      title: "Sem Estoque",
      value: summary.outOfStockCount,
      icon: XCircle,
      color: "text-destructive",
    },
  ];

  return (
    <div>
      <PageHeader
        title="Relatorio de Inventario"
        subtitle="Posicao completa de estoque por produto"
      />

      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6 mb-6">
        {summaryCards.map((card) => (
          <Card key={card.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-medium">{card.title}</CardTitle>
              <card.icon className={`h-3.5 w-3.5 ${card.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold">{card.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Posicao de Estoque</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produto</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead className="text-right">Estoque</TableHead>
                <TableHead className="text-right">Minimo</TableHead>
                {isAdmin && <TableHead className="text-right">Custo Unit.</TableHead>}
                <TableHead className="text-right">Venda Unit.</TableHead>
                {isAdmin && <TableHead className="text-right">Valor Total (Custo)</TableHead>}
                <TableHead className="text-right">Valor Total (Venda)</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((product) => {
                const isLow = product.minStock > 0 && product.currentStock <= product.minStock;
                const isOut = product.currentStock === 0;
                return (
                  <TableRow key={product.id}>
                    <TableCell className="font-medium">{product.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{product.sku || "-"}</TableCell>
                    <TableCell className="text-right font-mono">
                      {product.currentStock} {product.unit}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {product.minStock || "-"}
                    </TableCell>
                    {isAdmin && (
                      <TableCell className="text-right font-mono text-sm">
                        {formatCurrency(product.costPrice)}
                      </TableCell>
                    )}
                    <TableCell className="text-right font-mono text-sm">
                      {formatCurrency(product.salePrice)}
                    </TableCell>
                    {isAdmin && (
                      <TableCell className="text-right font-mono text-sm">
                        {formatCurrency(product.currentStock * Number(product.costPrice))}
                      </TableCell>
                    )}
                    <TableCell className="text-right font-mono text-sm">
                      {formatCurrency(product.currentStock * Number(product.salePrice))}
                    </TableCell>
                    <TableCell>
                      {isOut ? (
                        <StatusBadge variant="destructive">Sem Estoque</StatusBadge>
                      ) : isLow ? (
                        <StatusBadge variant="warning">Estoque Baixo</StatusBadge>
                      ) : (
                        <StatusBadge variant="success">Normal</StatusBadge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {products.length === 0 && (
                <TableRow>
                  <TableCell colSpan={isAdmin ? 9 : 7} className="text-center text-muted-foreground py-8">
                    Nenhum produto encontrado.
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
