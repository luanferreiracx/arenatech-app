"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Search, Eye } from "lucide-react";
import { useTRPC } from "@/trpc/react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/inputs/date-input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/domain/page-header";
import { DataTablePagination } from "@/components/domain/data-table/data-table-pagination";

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatDateTime(date: Date): string {
  return new Date(date).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function CashierHistoryPage() {
  const router = useRouter();
  const trpc = useTRPC();

  const [page, setPage] = useState(0);
  const [pageSize] = useState(10);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const historyQuery = useQuery(
    trpc.cashier.history.queryOptions({
      page,
      pageSize,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    }),
  );

  return (
    <div>
      <PageHeader
        title="Historico de Caixas"
        subtitle="Consulte os caixas fechados anteriormente"
        actions={
          <Button variant="outline" onClick={() => router.push("/cashier")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
          </Button>
        }
      />

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <Label className="text-sm">Data Inicio</Label>
              <DateInput
                value={dateFrom}
                onChange={(v) => { setDateFrom(v); setPage(0); }}
                className="w-44"
                aria-label="Data de inicio"
              />
            </div>
            <div>
              <Label className="text-sm">Data Fim</Label>
              <DateInput
                value={dateTo}
                onChange={(v) => { setDateTo(v); setPage(0); }}
                className="w-44"
                aria-label="Data de fim"
              />
            </div>
            {(dateFrom || dateTo) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setDateFrom("");
                  setDateTo("");
                  setPage(0);
                }}
              >
                Limpar filtros
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {historyQuery.isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Abertura</TableHead>
                    <TableHead>Fechamento</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Saldo Inicial</TableHead>
                    <TableHead className="text-right">Esperado</TableHead>
                    <TableHead className="text-right">Informado</TableHead>
                    <TableHead className="text-right">Diferenca</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historyQuery.data?.data.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={8}
                        className="text-center text-muted-foreground py-8"
                      >
                        Nenhum registro encontrado
                      </TableCell>
                    </TableRow>
                  ) : (
                    historyQuery.data?.data.map((reg) => (
                      <TableRow
                        key={reg.id}
                        className="cursor-pointer hover:bg-accent"
                        onClick={() => router.push(`/cashier/${reg.id}`)}
                      >
                        <TableCell className="text-sm">
                          {formatDateTime(reg.openedAt)}
                        </TableCell>
                        <TableCell className="text-sm">
                          {reg.closedAt
                            ? formatDateTime(reg.closedAt)
                            : "-"}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              reg.status === "OPEN" ? "default" : "secondary"
                            }
                          >
                            {reg.status === "OPEN" ? "Aberto" : "Fechado"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {formatCents(reg.openingBalance)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {reg.expectedBalance != null
                            ? formatCents(reg.expectedBalance)
                            : "-"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {reg.closingBalance != null
                            ? formatCents(reg.closingBalance)
                            : "-"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {reg.difference != null ? (
                            <span
                              className={
                                reg.difference < 0
                                  ? "text-destructive"
                                  : reg.difference > 0
                                    ? "text-success"
                                    : ""
                              }
                            >
                              {formatCents(reg.difference)}
                              {reg.difference !== 0 && (
                                <span className="text-xs ml-1">
                                  {reg.difference > 0 ? "SOBRA" : "FALTA"}
                                </span>
                              )}
                            </span>
                          ) : (
                            "-"
                          )}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" aria-label="Ver detalhes do caixa">
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>

              {historyQuery.data && historyQuery.data.pageCount > 1 && (
                <div className="p-4 border-t">
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>
                      {historyQuery.data.total} registro(s) encontrado(s)
                    </span>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page === 0}
                        onClick={() => setPage((p) => Math.max(0, p - 1))}
                      >
                        Anterior
                      </Button>
                      <span className="flex items-center px-2">
                        Pagina {page + 1} de {historyQuery.data.pageCount}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page + 1 >= historyQuery.data.pageCount}
                        onClick={() => setPage((p) => p + 1)}
                      >
                        Proxima
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
