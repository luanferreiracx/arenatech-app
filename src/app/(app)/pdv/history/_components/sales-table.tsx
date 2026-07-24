"use client";
import { formatCentsBRL as formatCurrency } from "@/lib/format";

import { useState } from "react";
import Link from "next/link";
import { useTRPC } from "@/trpc/react";
import { useQuery } from "@tanstack/react-query";
import { Eye, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/inputs/date-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/domain/status-badge";
import { SALE_STATUS_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/validators/sale";


function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const STATUS_VARIANTS: Record<
  string,
  "success" | "destructive" | "warning" | "default" | "info"
> = {
  COMPLETED: "success",
  CANCELLED: "destructive",
  REFUNDED: "warning",
  PARTIALLY_REFUNDED: "warning",
  DRAFT: "default",
};

const PAYMENT_TAGS: Record<string, { label: string; className: string }> = {
  pix: { label: "PIX", className: "bg-success/12 text-success" },
  cartao_credito: {
    label: "CRED",
    className: "bg-info/12 text-info",
  },
  cartao_debito: {
    label: "DEB",
    className: "bg-info/12 text-info",
  },
  dinheiro: {
    label: "DINH",
    className: "bg-warning/12 text-warning",
  },
  misto: {
    label: "MISTO",
    className: "bg-primary/12 text-primary",
  },
  crediario: {
    label: "CRED.",
    className: "bg-warning/12 text-warning",
  },
};

type SortField = "saleDate" | "totalAmount" | "subtotal" | "number" | "createdAt";
type SortOrder = "asc" | "desc";

export function SalesTable() {
  const trpc = useTRPC();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("");
  const [sellerId, setSellerId] = useState<string>("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(0);
  const [sortBy, setSortBy] = useState<SortField>("saleDate");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const pageSize = 30;

  // Fetch sellers for filter dropdown
  const sellersQuery = useQuery(trpc.sale.listSellers.queryOptions());
  const sellers = (sellersQuery.data ?? []) as Array<{
    id: string;
    name: string;
  }>;

  const { data, isLoading } = useQuery(
    trpc.sale.list.queryOptions({
      search: search || undefined,
      status:
        (status as
          | "COMPLETED"
          | "CANCELLED"
          | "REFUNDED"
          | "PARTIALLY_REFUNDED") || undefined,
      sellerId: sellerId || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      page,
      pageSize,
      sortBy,
      sortOrder,
    }),
  );

  // Status counts from stats query
  const statsQuery = useQuery(trpc.sale.stats.queryOptions());
  const stats = statsQuery.data;

  const sales = (data?.data ?? []) as Array<Record<string, unknown>>;
  const totalPages = data?.pageCount ?? 0;

  const toggleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortOrder(field === "number" ? "asc" : "desc");
    }
    setPage(0);
  };

  const renderSortIcon = (field: SortField) => {
    if (sortBy !== field) return null;
    return (
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="currentColor"
        className="inline ml-1"
      >
        <path
          d={
            sortOrder === "asc"
              ? "M12 4l-8 8h16z"
              : "M12 20l-8-8h16z"
          }
        />
      </svg>
    );
  };

  const clearFilters = () => {
    setSearch("");
    setDateFrom("");
    setDateTo("");
    setStatus("");
    setSellerId("");
    setPage(0);
  };

  const hasFilters = search || dateFrom || dateTo || status || sellerId;

  return (
    <div className="space-y-4">
      {/* Status Tabs */}
      <div className="flex gap-1.5 p-1 bg-card border border-border rounded-lg w-fit">
        {[
          {
            key: "",
            label: "Todas",
            count: stats?.totalAll,
          },
          {
            key: "COMPLETED",
            label: "Finalizadas",
            count: stats?.totalCompleted,
            dotColor: "bg-success",
            countColor: "text-success",
          },
          {
            key: "CANCELLED",
            label: "Canceladas",
            count: stats?.totalCancelled,
            dotColor: "bg-destructive",
            countColor: "text-destructive",
          },
          {
            key: "REFUNDED",
            label: "Estornadas",
            count: stats?.totalRefunded,
            dotColor: "bg-warning",
            countColor: "text-warning",
          },
        ].map((tab) => (
          <button
            key={tab.key}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              status === tab.key
                ? "bg-muted text-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted/50"
            }`}
            onClick={() => {
              setStatus(tab.key);
              setPage(0);
            }}
          >
            {tab.dotColor && (
              <span
                className={`w-1.5 h-1.5 rounded-full ${tab.dotColor}`}
              />
            )}
            {tab.count !== undefined && (
              <span
                className={`text-sm font-bold tabular-nums ${tab.countColor ?? ""}`}
              >
                {tab.count}
              </span>
            )}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <Input
            placeholder="Buscar venda, cliente..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            className="pl-9"
          />
        </div>

        <Select
          value={sellerId || "all"}
          onValueChange={(v) => {
            setSellerId(v === "all" ? "" : v);
            setPage(0);
          }}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Todos vendedores" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos vendedores</SelectItem>
            {sellers.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <DateInput
          value={dateFrom}
          onChange={(v) => { setDateFrom(v); setPage(0); }}
          className="w-36"
          aria-label="Data de inicio"
          placeholder="Data inicio"
        />
        <DateInput
          value={dateTo}
          onChange={(v) => { setDateTo(v); setPage(0); }}
          className="w-36"
          aria-label="Data de fim"
          placeholder="Data fim"
        />

        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="h-4 w-4 mr-1" />
            Limpar
          </Button>
        )}
      </div>

      {/* Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-primary/20 bg-muted/50">
                <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <button
                    type="button"
                    className={`inline-flex items-center gap-1 hover:text-primary transition-colors ${sortBy === "number" ? "text-primary" : ""}`}
                    onClick={() => toggleSort("number")}
                  >
                    Venda
                    {renderSortIcon("number")}
                  </button>
                </th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <button
                    type="button"
                    className={`inline-flex items-center gap-1 hover:text-primary transition-colors ${sortBy === "saleDate" ? "text-primary" : ""}`}
                    onClick={() => toggleSort("saleDate")}
                  >
                    Data
                    {renderSortIcon("saleDate")}
                  </button>
                </th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Cliente
                </th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Vendedor
                </th>
                <th className="text-center px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Itens
                </th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <button
                    type="button"
                    className={`inline-flex items-center gap-1 hover:text-primary transition-colors ml-auto ${sortBy === "subtotal" ? "text-primary" : ""}`}
                    onClick={() => toggleSort("subtotal")}
                  >
                    Valor
                    {renderSortIcon("subtotal")}
                  </button>
                </th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Pagamento
                </th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Status
                </th>
                <th className="text-center px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground w-20">
                  Acoes
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr
                    key={i}
                    className="border-b border-border animate-pulse"
                  >
                    <td colSpan={9} className="px-4 py-4">
                      <div className="h-4 bg-muted rounded w-full" />
                    </td>
                  </tr>
                ))
              ) : sales.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="text-center py-12 text-muted-foreground"
                  >
                    Nenhuma venda encontrada
                  </td>
                </tr>
              ) : (
                sales.map((sale) => {
                  const statusStr = sale.status as string;
                  const paymentDetails = sale.paymentDetails as
                    | Array<{ method: string }>
                    | null;
                  const mainMethod =
                    paymentDetails?.[0]?.method ?? "dinheiro";
                  const paymentKey =
                    paymentDetails && paymentDetails.length > 1
                      ? "misto"
                      : mainMethod;
                  const tag = PAYMENT_TAGS[paymentKey] ?? {
                    label: paymentKey.toUpperCase().slice(0, 6),
                    className: "bg-muted text-muted-foreground",
                  };

                  return (
                    <tr
                      key={sale.id as string}
                      className="border-b border-border hover:bg-primary/5 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/pdv/${sale.id as string}`}
                          className="text-primary font-bold tabular-nums hover:underline"
                        >
                          {sale.number as string}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                        {sale.saleDate
                          ? formatDate(sale.saleDate as string)
                          : "-"}
                      </td>
                      <td className="px-4 py-3 max-w-[180px] truncate">
                        {(sale.customerName as string) ?? "-"}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {sale.sellerName as string}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {sale.itemCount as number}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums whitespace-nowrap">
                        {formatCurrency(sale.subtotal as number)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold tracking-wider ${tag.className}`}
                        >
                          {tag.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge
                          variant={
                            STATUS_VARIANTS[statusStr] ?? "default"
                          }
                        >
                          {SALE_STATUS_LABELS[statusStr] ?? statusStr}
                        </StatusBadge>
                      </td>
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          asChild
                          aria-label="Ver detalhes da venda"
                        >
                          <Link href={`/pdv/${sale.id as string}`}>
                            <Eye className="h-4 w-4" />
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border">
            <span className="text-xs text-muted-foreground">
              Pagina {page + 1} de {totalPages} ({data?.total ?? 0}{" "}
              vendas)
            </span>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={page <= 0}
                onClick={() => setPage((p) => p - 1)}
                aria-label="Pagina anterior"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => p + 1)}
                aria-label="Proxima pagina"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
