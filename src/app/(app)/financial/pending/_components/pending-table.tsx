"use client";

import { onActivateKey } from "@/lib/utils/a11y";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTRPC } from "@/trpc/react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Clock, CheckCircle, Search } from "lucide-react";
import {
  TRANSACTION_STATUS_LABELS,
} from "@/lib/validators/financial";

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

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "OVERDUE":
      return "destructive";
    case "PARTIALLY_PAID":
      return "secondary";
    default:
      return "outline";
  }
}

export function PendingTable() {
  const router = useRouter();
  const trpc = useTRPC();

  const [status, setStatus] = useState<string>("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const pageSize = 20;

  const query = useQuery(
    trpc.financial.pending.queryOptions({
      status: status || undefined,
      search: search || undefined,
      page,
      pageSize,
    }),
  );

  const data = query.data;

  return (
    <div className="space-y-4">
      {/* Totals card */}
      {data && (
        <Card className="border-warning/30">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-full bg-warning/20 flex items-center justify-center">
                <Clock className="h-6 w-6 text-warning" />
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Total Pendente</div>
                <div className="text-2xl font-bold text-warning">
                  {formatCents(data.totals.totalPending)}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {data.totals.count} transacao(es) | Total: {formatCents(data.totals.totalAmount)} | Ja pago: {formatCents(data.totals.totalPaid)}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <Label>Status</Label>
              <Select
                value={status}
                onValueChange={(v) => {
                  setStatus(v === "ALL" ? "" : v);
                  setPage(0);
                }}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todos</SelectItem>
                  <SelectItem value="PENDING">Pendente</SelectItem>
                  <SelectItem value="PARTIALLY_PAID">Parcialmente Paga</SelectItem>
                  <SelectItem value="OVERDUE">Vencida</SelectItem>
                </SelectContent>
              </Select>
            </div>
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
            {(search || status) && (
              <Button
                variant="outline"
                onClick={() => {
                  setSearch("");
                  setStatus("");
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
          icon={CheckCircle}
          title="Nenhum valor pendente"
          description="Todas as contas a receber estao pagas."
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
                  <TableHead className="text-right">Ja Pago</TableHead>
                  <TableHead className="text-right">A Receber</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Vencimento</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.data.map((t) => (
                  <TableRow
                    key={t.id}
                    role="link"
                    tabIndex={0}
                    aria-label="Abrir transacao pendente"
                    className="cursor-pointer hover:bg-accent"
                    onClick={() => router.push(`/financial/${t.id}`)}
                    onKeyDown={onActivateKey(() => router.push(`/financial/${t.id}`))}
                  >
                    <TableCell className="max-w-[200px] truncate">
                      {t.description}
                    </TableCell>
                    <TableCell>{t.customerName ?? "-"}</TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCents(t.totalAmount)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-success">
                      {t.paidAmount > 0 ? formatCents(t.paidAmount) : "-"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-warning font-semibold">
                      {formatCents(t.remainingAmount)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(t.status)}>
                        {TRANSACTION_STATUS_LABELS[t.status] ?? t.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {formatDate(t.dueDate)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>

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
