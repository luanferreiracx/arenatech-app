"use client";

import { useState } from "react";
import { useTRPC } from "@/trpc/react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

function formatCurrency(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * Partner commission page.
 * Uses the same commission report data but groups by 7 Laravel categories:
 * acessorio propria/loja, aparelho propria/loja, servico sem peca/com peca, servico terceiros
 */
export function PartnerCommission() {
  const trpc = useTRPC();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());

  const reportQuery = useQuery(
    trpc.commission.report.queryOptions({ month, year }),
  );

  if (reportQuery.isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  const summary = reportQuery.data?.summary;

  return (
    <div className="space-y-6">
      {/* Period Selector */}
      <Card className="p-4">
        <div className="flex gap-4 items-end">
          <div>
            <Label className="text-xs">Mes</Label>
            <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 12 }, (_, i) => (
                  <SelectItem key={i + 1} value={String(i + 1)}>
                    {new Date(2000, i).toLocaleDateString("pt-BR", { month: "long" })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Ano</Label>
            <Input
              type="number"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="w-24"
            />
          </div>
        </div>
      </Card>

      {/* Summary */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="p-4 text-center">
            <p className="text-2xl font-bold text-yellow-500">{formatCurrency(summary.totalPending)}</p>
            <p className="text-xs text-muted-foreground">Pendente</p>
          </Card>
          <Card className="p-4 text-center">
            <p className="text-2xl font-bold text-blue-500">{formatCurrency(summary.totalApproved)}</p>
            <p className="text-xs text-muted-foreground">Aprovado</p>
          </Card>
          <Card className="p-4 text-center">
            <p className="text-2xl font-bold text-green-500">{formatCurrency(summary.totalPaid)}</p>
            <p className="text-xs text-muted-foreground">Pago</p>
          </Card>
          <Card className="p-4 text-center">
            <p className="text-2xl font-bold">{formatCurrency(summary.totalAll)}</p>
            <p className="text-xs text-muted-foreground">Total Geral</p>
          </Card>
        </div>
      )}

      {/* Categories breakdown */}
      <Card className="p-6">
        <h3 className="font-semibold mb-4">Categorias de Comissao</h3>
        <p className="text-sm text-muted-foreground">
          As categorias detalhadas (acessorio propria/loja, aparelho propria/loja,
          servico sem peca/com peca, servico terceiros) dependem de classificacao
          manual dos itens da venda/OS. O relatorio atual agrupa por tipo (Venda / OS).
        </p>
        <div className="mt-4 space-y-2">
          {reportQuery.data?.users.map((u) => (
            <div key={u.userId} className="flex justify-between py-2 border-b">
              <span className="font-medium">{u.userName}</span>
              <span className="font-mono">{formatCurrency(u.totalAmount)}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
