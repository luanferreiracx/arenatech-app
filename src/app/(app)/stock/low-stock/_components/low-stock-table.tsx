"use client";

import Link from "next/link";
import { useTRPC } from "@/trpc/react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/domain/status-badge";
import { LoadingState } from "@/components/domain/loading-state";

/**
 * Lista COMPLETA de produtos abaixo do estoque minimo (lowStockAlerts). O
 * dashboard mostra so o top 20; esta pagina lista tudo para reposicao.
 */
export function LowStockTable() {
  const trpc = useTRPC();
  const { data, isLoading } = useQuery(trpc.stock.lowStockAlerts.queryOptions());

  if (isLoading) {
    return <LoadingState variant="table" />;
  }

  const items = data ?? [];

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          Nenhum produto abaixo do estoque minimo. 👍
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Produto</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead className="text-right">Atual</TableHead>
              <TableHead className="text-right">Minimo</TableHead>
              <TableHead className="text-right">Faltam</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((p) => {
              const missing = Math.max(0, p.minStock - p.currentStock);
              const isOut = p.currentStock <= 0;
              return (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">
                    <Link href={`/stock/${p.id}`} className="hover:underline">
                      {p.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{p.sku ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    <StatusBadge variant={isOut ? "destructive" : "warning"}>
                      {p.currentStock}
                    </StatusBadge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{p.minStock}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium text-destructive">
                    {missing > 0 ? missing : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Link href={`/stock/${p.id}`} className="text-xs text-primary hover:underline">
                      Ver
                    </Link>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
