"use client";

import { use } from "react";
import Link from "next/link";
import { Pencil, ArrowLeft } from "lucide-react";
import { useTRPC } from "@/trpc/react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/domain/page-header";
import { LoadingState } from "@/components/domain/loading-state";
import { StatusBadge } from "@/components/domain/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { stockMovementTypeLabels } from "@/lib/validators/stock";
import { AdjustStockDialog } from "../_components/adjust-stock-dialog";
import { useState } from "react";

function formatCurrency(value: unknown): string {
  let num: number;
  if (typeof value === "object" && value !== null && "toNumber" in (value as Record<string, unknown>)) {
    num = (value as { toNumber: () => number }).toNumber();
  } else {
    num = Number(value);
  }
  return num.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
}

function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const trpc = useTRPC();
  const [showAdjust, setShowAdjust] = useState(false);

  const { data: product, isLoading } = useQuery(
    trpc.stock.getById.queryOptions({ id }),
  );

  if (isLoading) {
    return (
      <div>
        <PageHeader title="Detalhe do Produto" />
        <LoadingState variant="form" rows={6} />
      </div>
    );
  }

  if (!product) {
    return (
      <div>
        <PageHeader title="Produto nao encontrado" />
      </div>
    );
  }

  const isLow = product.minStock > 0 && product.currentStock <= product.minStock;

  return (
    <div>
      <PageHeader
        title={product.name}
        subtitle={product.sku ? `SKU: ${product.sku}` : undefined}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link href="/stock">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Voltar
              </Link>
            </Button>
            <Button variant="outline" onClick={() => setShowAdjust(true)}>
              Ajustar Estoque
            </Button>
            <Button asChild>
              <Link href={`/stock/${id}/edit`}>
                <Pencil className="mr-2 h-4 w-4" />
                Editar
              </Link>
            </Button>
          </div>
        }
      />

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Estoque Atual</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${isLow ? "text-destructive" : ""}`}>
              {product.currentStock} {product.unit}
            </div>
            {product.minStock > 0 && (
              <p className="text-xs text-muted-foreground">Minimo: {product.minStock}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Preco de Custo</CardTitle>
          </CardHeader>
          <CardContent>
            {product.hasVariations ? (
              <div className="text-sm text-muted-foreground italic">por variacao</div>
            ) : (
              <div className="text-2xl font-bold font-mono">{formatCurrency(product.costPrice)}</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Preco de Venda</CardTitle>
          </CardHeader>
          <CardContent>
            {product.hasVariations ? (
              <div className="text-sm text-muted-foreground italic">por variacao</div>
            ) : (
              <div className="text-2xl font-bold font-mono">{formatCurrency(product.salePrice)}</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Status</CardTitle>
          </CardHeader>
          <CardContent>
            <StatusBadge variant={product.active ? "success" : "destructive"}>
              {product.active ? "Ativo" : "Inativo"}
            </StatusBadge>
          </CardContent>
        </Card>
      </div>

      {product.description && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">Descricao</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{product.description}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ultimas Movimentacoes</CardTitle>
        </CardHeader>
        <CardContent>
          {product.movements.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Nenhuma movimentacao registrada.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Quantidade</TableHead>
                  <TableHead>Motivo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {product.movements.map((mov) => (
                  <TableRow key={mov.id}>
                    <TableCell className="text-sm">{formatDate(mov.createdAt)}</TableCell>
                    <TableCell>
                      <StatusBadge
                        variant={
                          mov.type === "ENTRY" || mov.type === "RELEASE"
                            ? "success"
                            : mov.type === "EXIT"
                              ? "destructive"
                              : "warning"
                        }
                      >
                        {stockMovementTypeLabels[mov.type] ?? mov.type}
                      </StatusBadge>
                    </TableCell>
                    <TableCell className="font-mono">
                      {mov.type === "EXIT" || mov.type === "RESERVE" ? "-" : "+"}
                      {mov.quantity}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[300px] truncate">
                      {mov.reason || "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {showAdjust && (
        <AdjustStockDialog
          open={showAdjust}
          onOpenChange={setShowAdjust}
          productId={product.id}
          productName={product.name}
          currentStock={product.currentStock}
        />
      )}
    </div>
  );
}
