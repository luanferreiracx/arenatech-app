"use client";

import { useState } from "react";
import { useTRPC } from "@/trpc/react";
import { useQuery } from "@tanstack/react-query";
import { LoadingState } from "@/components/domain/loading-state";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/domain/status-badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { formatCurrency } from "./report-helpers";

const DAYS_OPTIONS = [30, 60, 90, 180] as const;

export function ProdutosParadosTab() {
  const [days, setDays] = useState<number>(60);
  const trpc = useTRPC();
  const { data, isLoading } = useQuery(
    trpc.stock.stagnantProductsReport.queryOptions({ days }),
  );

  if (isLoading) return <LoadingState variant="table" />;
  if (!data) return null;

  const rows = data.rows;
  const totalImmobilized = rows.reduce((s, r) => s + (r.immobilizedValueCents ?? 0), 0);
  const hasCost = rows.some((r) => r.immobilizedValueCents !== null);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Sem venda há</label>
              <select
                className="min-w-[160px] rounded-md border bg-background px-3 py-2 text-sm"
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
              >
                {DAYS_OPTIONS.map((d) => (
                  <option key={d} value={d}>{d} dias</option>
                ))}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="mb-4 grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="py-4 text-center">
            <div className="text-2xl font-bold tabular-nums">{rows.length}</div>
            <p className="text-sm text-muted-foreground">Produtos parados (≥ {days} dias)</p>
          </CardContent>
        </Card>
        {hasCost && (
          <Card>
            <CardContent className="py-4 text-center">
              <div className="text-2xl font-bold tabular-nums text-warning">
                {formatCurrency(totalImmobilized)}
              </div>
              <p className="text-sm text-muted-foreground">Capital imobilizado</p>
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produto</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead className="text-center">Estoque</TableHead>
                <TableHead className="text-center">Última venda</TableHead>
                {hasCost && <TableHead className="text-right">Capital imobilizado</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-muted-foreground">{r.sku ?? "-"}</TableCell>
                  <TableCell className="text-center tabular-nums">{r.currentStock}</TableCell>
                  <TableCell className="text-center">
                    {r.lastSaleAt ? (
                      <span className="text-sm text-muted-foreground">
                        {new Date(r.lastSaleAt).toLocaleDateString("pt-BR")}
                        {r.daysStagnant != null && ` · ${r.daysStagnant}d`}
                      </span>
                    ) : (
                      <StatusBadge variant="warning">Nunca vendido</StatusBadge>
                    )}
                  </TableCell>
                  {hasCost && (
                    <TableCell className="text-right tabular-nums">
                      {r.immobilizedValueCents !== null ? formatCurrency(r.immobilizedValueCents) : "-"}
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={hasCost ? 5 : 4} className="py-8 text-center text-muted-foreground">
                    Nenhum produto parado no período — bom giro!
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
