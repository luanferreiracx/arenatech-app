"use client";

import { useState } from "react";
import Link from "next/link";
import { Eye, Banknote, Clock, CheckCircle, DollarSign } from "lucide-react";
import { useTRPC } from "@/trpc/react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/inputs/date-input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/domain/status-badge";
import { EmptyState } from "@/components/domain/empty-state";
import { LoadingState } from "@/components/domain/loading-state";
import { Plus } from "lucide-react";
import { DEPIX_STATUS_LABELS, PIX_KEY_TYPE_LABELS } from "@/lib/validators/depix-withdraw";

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const STATUS_VARIANT: Record<string, "default" | "warning" | "success" | "destructive" | "info"> = {
  PENDING: "warning",
  PROCESSING: "info",
  SENT: "success",
  FAILED: "destructive",
  CANCELLED: "default",
};

export function WithdrawalsContent() {
  const trpc = useTRPC();
  const [filters, setFilters] = useState({
    status: "",
    pixKey: "",
    recipientName: "",
    dateFrom: "",
    dateTo: "",
    page: 1,
  });

  const statsQuery = useQuery(trpc.depixWithdraw.stats.queryOptions());

  const listQuery = useQuery(
    trpc.depixWithdraw.list.queryOptions({
      status: filters.status ? (filters.status as "PENDING" | "PROCESSING" | "SENT" | "FAILED" | "CANCELLED") : undefined,
      pixKey: filters.pixKey || undefined,
      recipientName: filters.recipientName || undefined,
      dateFrom: filters.dateFrom || undefined,
      dateTo: filters.dateTo || undefined,
      page: filters.page,
      perPage: 20,
    }),
  );

  const handleFilter = () => {
    setFilters((f) => ({ ...f, page: 1 }));
  };

  const clearFilters = () => {
    setFilters({ status: "", pixKey: "", recipientName: "", dateFrom: "", dateTo: "", page: 1 });
  };

  return (
    <div className="space-y-6">
      {/* Stats */}
      {statsQuery.data && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10"><Banknote className="w-5 h-5 text-primary" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Total de Saques</p>
              <p className="text-2xl font-bold">{statsQuery.data.total}</p>
            </div>
          </Card>
          <Card className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-warning/10"><Clock className="w-5 h-5 text-warning" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Aguardando</p>
              <p className="text-2xl font-bold">{statsQuery.data.pending}</p>
            </div>
          </Card>
          <Card className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-success/10"><CheckCircle className="w-5 h-5 text-success" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Enviados</p>
              <p className="text-2xl font-bold">{statsQuery.data.sent}</p>
            </div>
          </Card>
          <Card className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-500/10"><DollarSign className="w-5 h-5 text-purple-500" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Valor Total Enviado</p>
              <p className="text-xl font-bold">{formatCurrency(statsQuery.data.totalSentAmount)}</p>
            </div>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <Label className="text-xs">Status</Label>
            <Select value={filters.status} onValueChange={(v) => setFilters((f) => ({ ...f, status: v === "ALL" ? "" : v }))}>
              <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todos</SelectItem>
                {Object.entries(DEPIX_STATUS_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Chave PIX</Label>
            <Input
              value={filters.pixKey}
              onChange={(e) => setFilters((f) => ({ ...f, pixKey: e.target.value }))}
              placeholder="Chave PIX..."
            />
          </div>
          <div>
            <Label className="text-xs">Destinatario</Label>
            <Input
              value={filters.recipientName}
              onChange={(e) => setFilters((f) => ({ ...f, recipientName: e.target.value }))}
              placeholder="Nome..."
            />
          </div>
          <div>
            <Label className="text-xs">Data Inicio</Label>
            <DateInput
              value={filters.dateFrom}
              onChange={(v) => setFilters((f) => ({ ...f, dateFrom: v }))}
              aria-label="Data de inicio"
            />
          </div>
          <div>
            <Label className="text-xs">Data Fim</Label>
            <DateInput
              value={filters.dateTo}
              onChange={(v) => setFilters((f) => ({ ...f, dateTo: v }))}
              aria-label="Data de fim"
            />
          </div>
        </div>
        <div className="flex gap-2 justify-end mt-3">
          <Button variant="outline" size="sm" onClick={clearFilters}>Limpar</Button>
          <Button size="sm" onClick={handleFilter}>Filtrar</Button>
        </div>
      </Card>

      {/* Table */}
      <Card className="overflow-hidden">
        {listQuery.isLoading ? (
          <LoadingState variant="table" />
        ) : !listQuery.data?.items.length ? (
          <EmptyState
            icon={Banknote}
            title="Nenhum saque encontrado"
            description={filters.status || filters.pixKey ? "Tente ajustar os filtros." : "Solicite o primeiro saque."}
            action={
              !filters.status ? (
                <Button asChild>
                  <Link href="/depix/withdrawals/new"><Plus className="w-4 h-4 mr-2" />Novo Saque</Link>
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium">Numero</th>
                  <th className="text-left p-3 font-medium">Data</th>
                  <th className="text-left p-3 font-medium">Tipo Chave</th>
                  <th className="text-left p-3 font-medium">Chave PIX</th>
                  <th className="text-left p-3 font-medium">Destinatario</th>
                  <th className="text-right p-3 font-medium">Valor</th>
                  <th className="text-left p-3 font-medium">Status</th>
                  <th className="text-center p-3 font-medium">Acoes</th>
                </tr>
              </thead>
              <tbody>
                {listQuery.data.items.map((w) => (
                  <tr key={w.id} className="border-b hover:bg-muted/30">
                    <td className="p-3 font-mono font-semibold">{w.number}</td>
                    <td className="p-3 text-muted-foreground">{formatDate(w.createdAt)}</td>
                    <td className="p-3">
                      <span className="text-xs font-semibold bg-primary/10 text-primary px-2 py-0.5 rounded">
                        {PIX_KEY_TYPE_LABELS[w.pixKeyType] ?? w.pixKeyType}
                      </span>
                    </td>
                    <td className="p-3 font-mono text-xs">{w.pixKey}</td>
                    <td className="p-3 text-muted-foreground text-xs">{w.recipientName ?? "-"}</td>
                    <td className="p-3 text-right font-semibold">{formatCurrency(w.requestedAmount)}</td>
                    <td className="p-3">
                      <StatusBadge variant={STATUS_VARIANT[w.status] ?? "default"}>
                        {w.statusLabel}
                      </StatusBadge>
                    </td>
                    <td className="p-3 text-center">
                      <Button variant="ghost" size="icon" asChild>
                        <Link href={`/depix/withdrawals/${w.id}`}>
                          <Eye className="w-4 h-4" />
                        </Link>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {listQuery.data && listQuery.data.totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 p-4 border-t">
            <Button
              variant="outline"
              size="sm"
              disabled={filters.page <= 1}
              onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}
            >
              Anterior
            </Button>
            <span className="text-sm text-muted-foreground">
              Pagina {filters.page} de {listQuery.data.totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={filters.page >= listQuery.data.totalPages}
              onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}
            >
              Proxima
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
