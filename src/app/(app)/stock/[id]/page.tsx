"use client";

import { use } from "react";
import Link from "next/link";
import { Pencil, ArrowLeft, Package } from "lucide-react";
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
  const primaryPhoto = product.photos.find((photo) => photo.isPrimary) ?? product.photos[0];
  const primaryImageUrl = primaryPhoto?.mediumUrl ?? primaryPhoto?.url ?? product.imageUrl;

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
            {/* Ajuste por quantidade nao se aplica a serializados (saldo deriva
                dos StockItems) — escondido para evitar uma acao que so daria erro. */}
            {!product.isSerialized && (
              <Button variant="outline" onClick={() => setShowAdjust(true)}>
                Ajustar Estoque
              </Button>
            )}
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

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Fotos do Produto</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-[240px_1fr]">
            <div className="flex aspect-square items-center justify-center overflow-hidden rounded-lg border bg-muted">
              {primaryImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={primaryImageUrl}
                  alt={product.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <Package className="h-16 w-16 text-muted-foreground/40" />
              )}
            </div>
            <div className="space-y-3">
              {product.photos.length > 0 ? (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                  {product.photos.map((photo) => (
                    <div key={photo.id} className="relative aspect-square overflow-hidden rounded-md border bg-muted">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={photo.thumbUrl ?? photo.mediumUrl ?? photo.url}
                        alt="Miniatura do produto"
                        className="h-full w-full object-cover"
                      />
                      {photo.isPrimary && (
                        <span className="absolute left-1 top-1 rounded bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
                          Principal
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Nenhuma foto cadastrada. Use a edicao do produto para enviar fotos ao Cloudinary.
                </p>
              )}
              <Button variant="outline" size="sm" asChild>
                <Link href={`/stock/${id}/edit`}>Gerenciar fotos</Link>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

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
