"use client";

import { useState } from "react";
import { useTRPC } from "@/trpc/react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/domain/empty-state";
import { Award } from "lucide-react";

function formatCurrency(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function CommissionReport() {
  const trpc = useTRPC();
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());

  const reportQuery = useQuery(trpc.commission.report.queryOptions({ month, year }));
  const report = reportQuery.data;

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Period selector */}
      <div className="flex gap-4 items-end">
        <div>
          <Label>Mes</Label>
          <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
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
          <Label>Ano</Label>
          <Input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-24" min={2020} max={2100} />
        </div>
      </div>

      {/* Totals */}
      {report ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold">{report.summary.count}</p>
                <p className="text-xs text-muted-foreground">Total</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-primary">{formatCurrency(report.summary.totalAll)}</p>
                <p className="text-xs text-muted-foreground">Valor Total</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-green-500">{formatCurrency(report.summary.totalPaid)}</p>
                <p className="text-xs text-muted-foreground">Pagas</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-yellow-500">{formatCurrency(report.summary.totalPending)}</p>
                <p className="text-xs text-muted-foreground">Pendentes</p>
              </CardContent>
            </Card>
          </div>

          {/* By user */}
          {report.users.length === 0 ? (
            <EmptyState icon={Award} title="Sem comissoes" description="Nenhuma comissao encontrada neste periodo" />
          ) : (
            <div className="space-y-3">
              {report.users.map((user) => (
                <Card key={user.userId}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{user.userName}</p>
                        <p className="text-sm text-muted-foreground">
                          {user.pendingCount} pendentes | {user.approvedCount} aprovadas | {user.paidCount} pagas
                        </p>
                      </div>
                      <p className="text-lg font-bold text-primary">{formatCurrency(user.totalAmount)}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      ) : (
        <Skeleton className="h-64" />
      )}
    </div>
  );
}
