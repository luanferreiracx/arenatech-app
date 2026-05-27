"use client";

import { useState } from "react";
import { useTRPC } from "@/trpc/react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/inputs/date-input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/domain/page-header";
import { LoadingState } from "@/components/domain/loading-state";
import { EmptyState } from "@/components/domain/empty-state";
import { StatusBadge } from "@/components/domain/status-badge";
import { format } from "date-fns";

const STATUS_LABELS: Record<string, string> = {
  SENT: "Enviado",
  FAILED: "Falha",
  PENDING: "Pendente",
  DELIVERED: "Entregue",
  READ: "Lido",
};

const STATUS_VARIANTS: Record<string, "default" | "success" | "warning" | "destructive" | "info"> = {
  SENT: "success",
  DELIVERED: "success",
  READ: "info",
  FAILED: "destructive",
  PENDING: "warning",
};

export default function WhatsappLogsPage() {
  const trpc = useTRPC();
  const [filters, setFilters] = useState({
    phone: "",
    status: "",
    dateFrom: "",
    dateTo: "",
    page: 0,
  });

  const { data, isLoading } = useQuery(
    trpc.admin.listWhatsappLogs.queryOptions({
      phone: filters.phone || undefined,
      status: filters.status as "SENT" | "FAILED" | "OUTSIDE_WINDOW" | undefined || undefined,
      dateFrom: filters.dateFrom || undefined,
      dateTo: filters.dateTo || undefined,
      page: filters.page,
      pageSize: 50,
    })
  );

  return (
    <div>
      <PageHeader title="WhatsApp - Logs de Envio" subtitle="Historico de mensagens WhatsApp de todos os tenants" />

      {/* Stats */}
      {data?.stats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card>
            <CardContent className="pt-6 text-center">
              <div className="text-2xl font-bold text-primary">{data.stats.total}</div>
              <div className="text-sm text-muted-foreground">Total (30 dias)</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <div className="text-2xl font-bold text-green-500">{data.stats.sent}</div>
              <div className="text-sm text-muted-foreground">Enviadas</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <div className="text-2xl font-bold text-red-500">{data.stats.failed}</div>
              <div className="text-sm text-muted-foreground">Falhas</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 items-end">
            <div>
              <Label className="text-xs uppercase text-muted-foreground">Telefone</Label>
              <Input placeholder="Telefone" value={filters.phone} onChange={(e) => setFilters((f) => ({ ...f, phone: e.target.value, page: 0 }))} />
            </div>
            <div>
              <Label className="text-xs uppercase text-muted-foreground">Status</Label>
              <Select value={filters.status} onValueChange={(v) => setFilters((f) => ({ ...f, status: v === "__all__" ? "" : v, page: 0 }))}>
                <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todos</SelectItem>
                  <SelectItem value="SENT">Enviado</SelectItem>
                  <SelectItem value="FAILED">Falha</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs uppercase text-muted-foreground">De</Label>
              <DateInput value={filters.dateFrom} onChange={(v) => setFilters((f) => ({ ...f, dateFrom: v, page: 0 }))} aria-label="Data de inicio" />
            </div>
            <div>
              <Label className="text-xs uppercase text-muted-foreground">Ate</Label>
              <DateInput value={filters.dateTo} onChange={(v) => setFilters((f) => ({ ...f, dateTo: v, page: 0 }))} aria-label="Data de fim" />
            </div>
            <div>
              {(filters.phone || filters.status || filters.dateFrom || filters.dateTo) && (
                <Button variant="outline" size="sm" onClick={() => setFilters({ phone: "", status: "", dateFrom: "", dateTo: "", page: 0 })}>
                  Limpar
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading && <LoadingState />}

      {!isLoading && data && (
        <Card>
          <CardContent className="p-0">
            {data.data.length === 0 ? (
              <EmptyState title="Nenhum envio encontrado" description="Ajuste os filtros para ver mais registros." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-3 font-medium text-muted-foreground">Quando</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Telefone</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Tenant</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.data.map((msg) => (
                      <tr key={msg.id} className="border-b hover:bg-muted/30">
                        <td className="p-3 text-muted-foreground">
                          {format(new Date(msg.createdAt), "dd/MM HH:mm")}
                        </td>
                        <td className="p-3 font-mono text-xs">
                          {msg.recipientPhone ?? "-"}
                        </td>
                        <td className="p-3">
                          <StatusBadge
                            variant={STATUS_VARIANTS[msg.status] ?? "default"}
                          >{STATUS_LABELS[msg.status] ?? msg.status}</StatusBadge>
                        </td>
                        <td className="p-3 text-muted-foreground text-xs">
                          {msg.tenantId?.slice(0, 8) ?? "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {data && data.pageCount > 1 && (
        <div className="flex justify-center gap-2 mt-4">
          <Button variant="outline" size="sm" disabled={filters.page === 0} onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}>
            Anterior
          </Button>
          <span className="text-sm text-muted-foreground self-center">
            Pagina {filters.page + 1} de {data.pageCount}
          </span>
          <Button variant="outline" size="sm" disabled={filters.page >= data.pageCount - 1} onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}>
            Proxima
          </Button>
        </div>
      )}
    </div>
  );
}
