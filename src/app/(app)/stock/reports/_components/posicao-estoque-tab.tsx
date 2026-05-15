"use client";

import { useState } from "react";
import { useTRPC } from "@/trpc/react";
import { useQuery } from "@tanstack/react-query";
import { LoadingState } from "@/components/domain/loading-state";
import { StatusBadge } from "@/components/domain/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { formatCurrency, formatCurrencyFromDecimal } from "./report-helpers";

export function PosicaoEstoqueTab() {
  const [categoryId, setCategoryId] = useState<string>("");
  const [onlyWithStock, setOnlyWithStock] = useState(false);

  const trpc = useTRPC();
  const { data: categories } = useQuery(
    trpc.stock.listCategories.queryOptions({ pageSize: 100 }),
  );
  const { data, isLoading } = useQuery(
    trpc.stock.reportPosicao.queryOptions({
      categoryId: categoryId || undefined,
      onlyWithStock,
    }),
  );

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Categoria</label>
              <select
                className="border rounded-md px-3 py-2 text-sm bg-background min-w-[200px]"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
              >
                <option value="">Todas</option>
                {categories?.data.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2 pb-1">
              <Checkbox
                id="onlyWithStock"
                checked={onlyWithStock}
                onCheckedChange={(v) => setOnlyWithStock(!!v)}
              />
              <label htmlFor="onlyWithStock" className="text-sm">
                Apenas com estoque
              </label>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading && <LoadingState variant="table" />}

      {data && (
        <>
          {/* Totals */}
          <div className="grid gap-4 md:grid-cols-2 mb-4">
            <Card className="bg-primary text-primary-foreground">
              <CardContent className="text-center py-4">
                <div className="text-2xl font-bold">{data.totals.quantity.toLocaleString("pt-BR")}</div>
                <p className="text-sm opacity-80">Itens em Estoque</p>
              </CardContent>
            </Card>
            <Card className="bg-emerald-600 text-white">
              <CardContent className="text-center py-4">
                <div className="text-2xl font-bold">{formatCurrency(data.totals.value)}</div>
                <p className="text-sm opacity-80">Valor Total em Estoque</p>
              </CardContent>
            </Card>
          </div>

          {/* Table */}
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produto</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead className="text-center">Qtd</TableHead>
                    <TableHead className="text-right">Valor Unit.</TableHead>
                    <TableHead className="text-right">Valor Total</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.products.map((p) => {
                    const isLow = p.minStock > 0 && p.currentStock <= p.minStock;
                    const isOut = p.currentStock === 0;
                    return (
                      <TableRow key={p.id} className={isOut ? "opacity-50" : ""}>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell className="text-muted-foreground">{p.sku || "-"}</TableCell>
                        <TableCell>{p.category?.name ?? "-"}</TableCell>
                        <TableCell className="text-center">
                          {isOut ? (
                            <StatusBadge variant="default">0</StatusBadge>
                          ) : isLow ? (
                            <StatusBadge variant="warning">{p.currentStock}</StatusBadge>
                          ) : (
                            <StatusBadge variant="success">{p.currentStock}</StatusBadge>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {p.currentStock > 0
                            ? formatCurrencyFromDecimal(Number(p.salePrice))
                            : "-"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {formatCurrencyFromDecimal(p.currentStock * Number(p.salePrice))}
                        </TableCell>
                        <TableCell>
                          {isOut ? (
                            <StatusBadge variant="destructive">Sem Estoque</StatusBadge>
                          ) : isLow ? (
                            <StatusBadge variant="warning">Baixo</StatusBadge>
                          ) : (
                            <StatusBadge variant="success">Normal</StatusBadge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {data.products.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        Nenhum produto encontrado
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
