"use client";

import { useState } from "react";
import { useTRPC } from "@/trpc/react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/domain/page-header";
import { LoadingState } from "@/components/domain/loading-state";
import { EmptyState } from "@/components/domain/empty-state";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

function formatCents(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

export default function TechnicianReportPage() {
  const trpc = useTRPC();

  // Default: first day of current month to today
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const today = now.toISOString().slice(0, 10);

  const [filters, setFilters] = useState({
    dateFrom: firstDay,
    dateTo: today,
    technicianId: "",
  });

  const { data, isLoading } = useQuery(
    trpc.serviceOrder.technicianReport.queryOptions({
      dateFrom: filters.dateFrom || undefined,
      dateTo: filters.dateTo || undefined,
      technicianId: filters.technicianId || undefined,
    })
  );

  const { data: technicians } = useQuery(
    trpc.serviceOrder.listTechnicians.queryOptions(),
  );

  return (
    <div>
      <PageHeader
        title="Relatorio por Tecnico"
        subtitle="Desempenho individual de cada tecnico nas assistencias"
        actions={
          <Button variant="outline" asChild>
            <Link href="/service-orders">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Voltar
            </Link>
          </Button>
        }
      />

      {/* Filters */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-sm">Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 items-end">
            <div>
              <Label className="text-xs uppercase text-muted-foreground">Data Inicio</Label>
              <Input type="date" value={filters.dateFrom} onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs uppercase text-muted-foreground">Data Fim</Label>
              <Input type="date" value={filters.dateTo} onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs uppercase text-muted-foreground">Tecnico</Label>
              <Select
                value={filters.technicianId || "all"}
                onValueChange={(v) =>
                  setFilters((f) => ({ ...f, technicianId: v === "all" ? "" : v }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {(technicians ?? []).map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              {(filters.dateFrom !== firstDay || filters.dateTo !== today || filters.technicianId) && (
                <Button variant="outline" size="sm" onClick={() => setFilters({ dateFrom: firstDay, dateTo: today, technicianId: "" })}>
                  Limpar
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      {data?.totals && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <Card>
            <CardContent className="pt-6 text-center">
              <div className="text-2xl font-bold text-primary">{data.totals.totalOs}</div>
              <div className="text-xs text-muted-foreground uppercase">Total de OS</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <div className="text-2xl font-bold text-green-500">{data.totals.completed}</div>
              <div className="text-xs text-muted-foreground uppercase">Concluidas</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <div className="text-2xl font-bold text-primary">{formatCents(data.totals.totalValue)}</div>
              <div className="text-xs text-muted-foreground uppercase">Valor Total</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <div className="text-2xl font-bold">{formatCents(data.totals.ticketMedio)}</div>
              <div className="text-xs text-muted-foreground uppercase">Ticket Medio</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <div className="text-2xl font-bold text-green-500">{formatCents(data.totals.profit)}</div>
              <div className="text-xs text-muted-foreground uppercase">Lucro</div>
            </CardContent>
          </Card>
        </div>
      )}

      {isLoading && <LoadingState />}

      {!isLoading && data && (
        <Card>
          <CardContent className="p-0">
            {data.items.length === 0 ? (
              <EmptyState title="Nenhuma OS encontrada" description="Nenhuma OS encontrada no periodo selecionado." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-3 font-medium text-muted-foreground">#</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Tecnico</th>
                      <th className="text-center p-3 font-medium text-muted-foreground">Total OS</th>
                      <th className="text-center p-3 font-medium text-muted-foreground">Concluidas</th>
                      <th className="text-center p-3 font-medium text-muted-foreground">Canceladas</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Valor Servico</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Valor Pecas</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Valor Total</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Custo Pecas</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Outros Custos</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Lucro</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Ticket Medio</th>
                      <th className="text-center p-3 font-medium text-muted-foreground">Tempo Medio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((item, index) => (
                      <tr key={item.technicianId} className="border-b hover:bg-muted/30">
                        <td className="p-3">
                          {index < 3 ? (
                            <span className="inline-block px-2 py-0.5 rounded text-xs font-bold bg-yellow-500/20 text-yellow-500">
                              {index + 1}
                            </span>
                          ) : (
                            index + 1
                          )}
                        </td>
                        <td className="p-3 font-medium">{item.technicianName}</td>
                        <td className="p-3 text-center">{item.totalOs}</td>
                        <td className="p-3 text-center text-green-500">{item.completed}</td>
                        <td className="p-3 text-center text-red-500">{item.cancelled}</td>
                        <td className="p-3 text-right">{formatCents(item.serviceValue)}</td>
                        <td className="p-3 text-right">{formatCents(item.partsValue)}</td>
                        <td className="p-3 text-right font-bold">{formatCents(item.totalValue)}</td>
                        <td className="p-3 text-right">{formatCents(item.partsCost)}</td>
                        <td className="p-3 text-right">{formatCents(item.otherCost)}</td>
                        <td className="p-3 text-right text-green-500 font-bold">{formatCents(item.profit)}</td>
                        <td className="p-3 text-right">{formatCents(item.ticketMedio)}</td>
                        <td className="p-3 text-center">
                          {item.avgDays !== null ? `${item.avgDays} dias` : <span className="text-muted-foreground">-</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-primary bg-primary/5 font-bold">
                      <td className="p-3" colSpan={2}>TOTAL</td>
                      <td className="p-3 text-center">{data.totals.totalOs}</td>
                      <td className="p-3 text-center">{data.totals.completed}</td>
                      <td className="p-3 text-center">{data.totals.cancelled}</td>
                      <td className="p-3 text-right">{formatCents(data.totals.serviceValue)}</td>
                      <td className="p-3 text-right">{formatCents(data.totals.partsValue)}</td>
                      <td className="p-3 text-right">{formatCents(data.totals.totalValue)}</td>
                      <td className="p-3 text-right">{formatCents(data.totals.partsCost)}</td>
                      <td className="p-3 text-right">{formatCents(data.totals.otherCost)}</td>
                      <td className="p-3 text-right text-green-500">{formatCents(data.totals.profit)}</td>
                      <td className="p-3 text-right">{formatCents(data.totals.ticketMedio)}</td>
                      <td className="p-3"></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
