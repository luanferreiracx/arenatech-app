"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/inputs/date-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/domain/status-badge";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import {
  TRANSACTION_STATUS_LABELS,
} from "@/lib/validators/financial";
import { PAYMENT_METHOD_LABELS } from "@/lib/validators/cashier";

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

function statusVariant(status: string) {
  switch (status) {
    case "PENDING":
      return "warning" as const;
    case "PAID":
      return "success" as const;
    case "OVERDUE":
      return "destructive" as const;
    case "PARTIALLY_PAID":
      return "info" as const;
    case "CANCELLED":
      return "default" as const;
    default:
      return "default" as const;
  }
}

interface TransactionRow {
  id: string;
  description: string;
  customerName: string | null;
  supplier: string | null;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  status: string;
  dueDate: Date;
  emissionDate: Date | null;
  paymentMethod: string | null;
  installments?: Array<{ number: number; status: string }>;
}

interface Filters {
  status: string | undefined;
  search: string;
  dateFrom: string;
  dateTo: string;
  page: number;
}

interface TransactionsTableProps {
  type: "RECEIVABLE" | "PAYABLE";
  data: TransactionRow[];
  total: number;
  pageCount: number;
  isLoading: boolean;
  filters: Filters;
  onFiltersChange: (fn: (prev: Filters) => Filters) => void;
  onRowClick: (id: string) => void;
}

export function TransactionsTable({
  type,
  data,
  total,
  pageCount,
  isLoading,
  filters,
  onFiltersChange,
  onRowClick,
}: TransactionsTableProps) {
  const isReceivable = type === "RECEIVABLE";

  const clearFilters = () => {
    onFiltersChange(() => ({
      status: undefined,
      search: "",
      dateFrom: "",
      dateTo: "",
      page: 0,
    }));
  };

  const hasActiveFilters = filters.status || filters.search || filters.dateFrom || filters.dateTo;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {isReceivable ? "Contas a Receber" : "Contas a Pagar"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={isReceivable ? "Buscar por descricao ou cliente..." : "Buscar por descricao ou fornecedor..."}
              value={filters.search}
              onChange={(e) =>
                onFiltersChange((f) => ({ ...f, search: e.target.value, page: 0 }))
              }
              className="pl-9"
            />
          </div>

          <Select
            value={filters.status ?? "all"}
            onValueChange={(v) =>
              onFiltersChange((f) => ({
                ...f,
                status: v === "all" ? undefined : v,
                page: 0,
              }))
            }
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="PENDING">Pendente</SelectItem>
              <SelectItem value="PARTIALLY_PAID">Parcial</SelectItem>
              <SelectItem value="PAID">Paga</SelectItem>
              <SelectItem value="OVERDUE">Vencida</SelectItem>
              <SelectItem value="CANCELLED">Cancelada</SelectItem>
            </SelectContent>
          </Select>

          <DateInput
            value={filters.dateFrom}
            onChange={(v) =>
              onFiltersChange((f) => ({ ...f, dateFrom: v, page: 0 }))
            }
            className="w-[150px]"
            placeholder="De"
            aria-label="Data de inicio"
          />
          <DateInput
            value={filters.dateTo}
            onChange={(v) =>
              onFiltersChange((f) => ({ ...f, dateTo: v, page: 0 }))
            }
            className="w-[150px]"
            placeholder="Ate"
            aria-label="Data de fim"
          />

          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X className="mr-1 h-4 w-4" />
              Limpar
            </Button>
          )}
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : data.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Nenhuma transacao encontrada
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Descricao</TableHead>
                    <TableHead>{isReceivable ? "Cliente" : "Fornecedor"}</TableHead>
                    <TableHead className="text-right">Valor Total</TableHead>
                    <TableHead className="text-right">Restante</TableHead>
                    <TableHead>Parcelas</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead>Forma Pgto</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((row) => {
                    const paidInstallments = row.installments?.filter(
                      (i) => i.status === "PAID",
                    ).length ?? 0;
                    const totalInstallments = row.installments?.length ?? 0;

                    return (
                      <TableRow
                        key={row.id}
                        className="cursor-pointer hover:bg-accent/50"
                        onClick={() => onRowClick(row.id)}
                      >
                        <TableCell className="max-w-[200px] truncate font-medium">
                          {row.description}
                        </TableCell>
                        <TableCell className="text-sm">
                          {isReceivable ? (row.customerName ?? "-") : (row.supplier ?? "-")}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {formatCents(row.totalAmount)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          <span className={row.remainingAmount > 0 ? "text-warning" : "text-success"}>
                            {formatCents(row.remainingAmount)}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm">
                          {paidInstallments}/{totalInstallments}
                        </TableCell>
                        <TableCell className="text-sm">
                          {formatDate(row.dueDate)}
                        </TableCell>
                        <TableCell className="text-sm">
                          {row.paymentMethod
                            ? (PAYMENT_METHOD_LABELS[row.paymentMethod] ?? row.paymentMethod)
                            : "-"}
                        </TableCell>
                        <TableCell>
                          <StatusBadge variant={statusVariant(row.status)}>
                            {TRANSACTION_STATUS_LABELS[row.status] ?? row.status}
                          </StatusBadge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between pt-2">
              <p className="text-sm text-muted-foreground">
                {total} transacao(es) encontrada(s)
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={filters.page === 0}
                  onClick={() =>
                    onFiltersChange((f) => ({ ...f, page: f.page - 1 }))
                  }
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm">
                  Pagina {filters.page + 1} de {Math.max(pageCount, 1)}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={filters.page >= pageCount - 1}
                  onClick={() =>
                    onFiltersChange((f) => ({ ...f, page: f.page + 1 }))
                  }
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
