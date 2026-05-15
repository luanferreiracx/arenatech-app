"use client";

import { useState } from "react";
import { useTRPC } from "@/trpc/react";
import { useQuery } from "@tanstack/react-query";
import { LoadingState } from "@/components/domain/loading-state";
import { StatusBadge } from "@/components/domain/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export function EstoqueMinTab() {
  const [onlyBelowMin, setOnlyBelowMin] = useState(true);
  const [categoryId, setCategoryId] = useState("");

  const trpc = useTRPC();
  const { data: categories } = useQuery(
    trpc.stock.listCategories.queryOptions({ pageSize: 100 }),
  );
  const { data, isLoading } = useQuery(
    trpc.stock.reportEstoqueMin.queryOptions({
      onlyBelowMin,
      categoryId: categoryId || undefined,
    }),
  );

  if (isLoading) return <LoadingState variant="table" />;
  if (!data) return null;

  return (
    <div className="space-y-4">
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
                id="onlyBelowMin"
                checked={onlyBelowMin}
                onCheckedChange={(v) => setOnlyBelowMin(!!v)}
              />
              <label htmlFor="onlyBelowMin" className="text-sm">
                Apenas abaixo do minimo
              </label>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3 mb-4">
        <Card className="bg-destructive text-destructive-foreground">
          <CardContent className="text-center py-4">
            <div className="text-2xl font-bold">{data.totals.below}</div>
            <p className="text-sm opacity-80">Abaixo do Minimo</p>
          </CardContent>
        </Card>
        <Card className="bg-emerald-600 text-white">
          <CardContent className="text-center py-4">
            <div className="text-2xl font-bold">{data.totals.ok}</div>
            <p className="text-sm opacity-80">Dentro do Limite</p>
          </CardContent>
        </Card>
        <Card className="bg-blue-600 text-white">
          <CardContent className="text-center py-4">
            <div className="text-2xl font-bold">{data.totals.total}</div>
            <p className="text-sm opacity-80">Total Analisado</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produto</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead className="text-center">Estoque Atual</TableHead>
                <TableHead className="text-center">Estoque Minimo</TableHead>
                <TableHead className="text-center">Diferenca</TableHead>
                <TableHead className="text-center">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.products.map((p) => (
                <TableRow key={p.id} className={p.status === "below" ? "bg-destructive/5" : ""}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell>{p.category?.name ?? "-"}</TableCell>
                  <TableCell className="text-center">{p.currentStock}</TableCell>
                  <TableCell className="text-center">{p.minStock}</TableCell>
                  <TableCell className={`text-center font-bold ${p.diff < 0 ? "text-destructive" : "text-emerald-500"}`}>
                    {p.diff >= 0 ? "+" : ""}{p.diff}
                  </TableCell>
                  <TableCell className="text-center">
                    {p.status === "below" ? (
                      <StatusBadge variant="destructive">Repor</StatusBadge>
                    ) : (
                      <StatusBadge variant="success">OK</StatusBadge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {data.products.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    Nenhum produto com estoque minimo configurado
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
