"use client";

import { useState } from "react";
import { useTRPC } from "@/trpc/react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/inputs/date-input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LoadingState } from "@/components/domain/loading-state";
import { EmptyState } from "@/components/domain/empty-state";
import { Search, DollarSign } from "lucide-react";

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatDate(date: Date | string | null): string {
  if (!date) return "-";
  return new Date(date).toLocaleDateString("pt-BR");
}

export function ReceivablesTable() {
  const trpc = useTRPC();

  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(0);
  const pageSize = 20;

  const query = useQuery(
    trpc.financial.receivables.queryOptions({
      search: search || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      page,
      pageSize,
    }),
  );

  const data = query.data;

  return (
    <div className="space-y-4">
      {/* Stats cards */}
      {data && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card className="bg-green-600/10 border-green-600/30">
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground">Total Recebido</div>
              <div className="text-2xl font-bold text-green-600">
                {formatCents(data.totals.totalReceived)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground">Quantidade</div>
              <div className="text-2xl font-bold">{data.totals.count}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-[200px]">
              <Label>Buscar</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Descricao ou cliente..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(0);
                  }}
                  className="pl-10"
                />
              </div>
            </div>
            <div>
              <Label>Data Inicio</Label>
              <DateInput
                value={dateFrom}
                onChange={(v) => { setDateFrom(v); setPage(0); }}
                aria-label="Data de inicio"
              />
            </div>
            <div>
              <Label>Data Fim</Label>
              <DateInput
                value={dateTo}
                onChange={(v) => { setDateTo(v); setPage(0); }}
                aria-label="Data de fim"
              />
            </div>
            {(search || dateFrom || dateTo) && (
              <Button
                variant="outline"
                onClick={() => {
                  setSearch("");
                  setDateFrom("");
                  setDateTo("");
                  setPage(0);
                }}
              >
                Limpar
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      {query.isLoading ? (
        <LoadingState />
      ) : !data || data.data.length === 0 ? (
        <EmptyState
          icon={DollarSign}
          title="Nenhum recebimento encontrado"
          description="Nenhuma transacao corresponde aos filtros selecionados."
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {data.total} resultado(s)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Descricao</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="text-right">Valor Total</TableHead>
                  <TableHead className="text-right">Valor Pago</TableHead>
                  <TableHead>Forma</TableHead>
                  <TableHead>Data Pag.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.data.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="max-w-[200px] truncate">
                      {t.description}
                    </TableCell>
                    <TableCell>{t.customerName ?? "-"}</TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCents(t.totalAmount)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-green-600">
                      {formatCents(t.paidAmount)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {t.paymentMethod ?? "-"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {formatDate(t.paidAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>

          {/* Pagination */}
          {data.pageCount > 1 && (
            <div className="flex items-center justify-center gap-2 p-4 border-t">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage(page - 1)}
              >
                Anterior
              </Button>
              <span className="text-sm text-muted-foreground">
                Pagina {page + 1} de {data.pageCount}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= data.pageCount - 1}
                onClick={() => setPage(page + 1)}
              >
                Proximo
              </Button>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
