"use client";

import { useTRPC } from "@/trpc/react";
import { useQuery } from "@tanstack/react-query";
import { LoadingState } from "@/components/domain/loading-state";
import { StatusBadge } from "@/components/domain/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter,
} from "@/components/ui/table";
import { formatCurrency, formatDate } from "./report-helpers";
import { deviceConditionLabels } from "@/lib/validators/stock";

interface Props {
  dateFrom: string;
  dateTo: string;
}

export function UpgradesTab({ dateFrom, dateTo }: Props) {
  const trpc = useTRPC();
  const { data, isLoading } = useQuery(
    trpc.stock.reportUpgrades.queryOptions({ dateFrom, dateTo }),
  );

  if (isLoading) return <LoadingState variant="table" />;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3 mb-4">
        <Card className="bg-primary text-primary-foreground">
          <CardContent className="text-center py-4">
            <div className="text-2xl font-bold">{data.totals.quantity}</div>
            <p className="text-sm opacity-80">Total de Upgrades</p>
          </CardContent>
        </Card>
        <Card className="bg-blue-600 text-white">
          <CardContent className="text-center py-4">
            <div className="text-2xl font-bold">{formatCurrency(data.totals.totalPurchaseValue)}</div>
            <p className="text-sm opacity-80">Valor de Compra</p>
          </CardContent>
        </Card>
        <Card className="bg-emerald-600 text-white">
          <CardContent className="text-center py-4">
            <div className="text-2xl font-bold">{formatCurrency(data.totals.totalSaleValue)}</div>
            <p className="text-sm opacity-80">Valor de Revenda</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Aparelho</TableHead>
                <TableHead>IMEI/Serie</TableHead>
                <TableHead>Condicao</TableHead>
                <TableHead className="text-right">Compra</TableHead>
                <TableHead className="text-right">Revenda</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.purchases.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{formatDate(p.createdAt)}</TableCell>
                  <TableCell className="font-medium">
                    {p.brand} {p.model}
                    {p.product && (
                      <span className="text-muted-foreground text-xs block">
                        {p.product.name}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <code className="text-xs">{p.imei ?? p.serial ?? "-"}</code>
                  </TableCell>
                  <TableCell>
                    <StatusBadge variant="default">
                      {deviceConditionLabels[p.condition] ?? p.condition}
                    </StatusBadge>
                    {p.batteryHealth != null && (
                      <span className="text-xs text-muted-foreground ml-1">
                        ({p.batteryHealth}%)
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(p.purchasePrice)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-emerald-500">
                    {p.salePrice != null ? formatCurrency(p.salePrice) : "-"}
                  </TableCell>
                </TableRow>
              ))}
              {data.purchases.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    Nenhum upgrade encontrado no periodo
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
            {data.purchases.length > 0 && (
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={4} className="font-bold">TOTAL</TableCell>
                  <TableCell className="text-right font-bold font-mono">
                    {formatCurrency(data.totals.totalPurchaseValue)}
                  </TableCell>
                  <TableCell className="text-right font-bold font-mono">
                    {formatCurrency(data.totals.totalSaleValue)}
                  </TableCell>
                </TableRow>
              </TableFooter>
            )}
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
