"use client";

import { useState } from "react";
import Link from "next/link";
import { useTRPC } from "@/trpc/react";
import { useQuery } from "@tanstack/react-query";
import { Eye, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/domain/status-badge";
import { SALE_STATUS_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/validators/sale";

function formatCurrency(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const STATUS_VARIANTS: Record<string, "success" | "destructive" | "warning" | "default" | "info"> = {
  COMPLETED: "success",
  CANCELLED: "destructive",
  REFUNDED: "warning",
  PARTIALLY_REFUNDED: "warning",
  DRAFT: "default",
};

const PAYMENT_TAGS: Record<string, { label: string; className: string }> = {
  pix: { label: "PIX", className: "bg-green-500/12 text-green-400" },
  cartao_credito: { label: "CRED", className: "bg-blue-500/12 text-blue-400" },
  cartao_debito: { label: "DEB", className: "bg-blue-500/12 text-blue-400" },
  dinheiro: { label: "DINH", className: "bg-yellow-500/12 text-yellow-400" },
  misto: { label: "MISTO", className: "bg-purple-500/12 text-purple-400" },
};

export function SalesTable() {
  const trpc = useTRPC();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(0);
  const pageSize = 20;

  const { data, isLoading } = useQuery(
    trpc.sale.list.queryOptions({
      search: search || undefined,
      status: (status as "COMPLETED" | "CANCELLED" | "REFUNDED" | "PARTIALLY_REFUNDED") || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      page,
      pageSize,
      sortBy: "saleDate",
      sortOrder: "desc",
    }),
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sales = (data?.data ?? []) as Array<Record<string, any>>;
  const totalPages = data?.pageCount ?? 0;

  return (
    <div className="space-y-4">
      {/* Status Tabs */}
      <div className="flex gap-1.5 p-1 bg-card border border-border rounded-lg w-fit">
        {[
          { key: "", label: "Todas" },
          { key: "COMPLETED", label: "Finalizadas" },
          { key: "CANCELLED", label: "Canceladas" },
          { key: "REFUNDED", label: "Estornadas" },
        ].map((tab) => (
          <button
            key={tab.key}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              status === tab.key
                ? "bg-muted text-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted/50"
            }`}
            onClick={() => {
              setStatus(tab.key);
              setPage(0);
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <Input
          placeholder="Buscar venda, cliente..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
          className="max-w-xs"
        />
        <Input
          type="date"
          value={dateFrom}
          onChange={(e) => {
            setDateFrom(e.target.value);
            setPage(0);
          }}
          className="w-36"
          title="Data inicio"
        />
        <Input
          type="date"
          value={dateTo}
          onChange={(e) => {
            setDateTo(e.target.value);
            setPage(0);
          }}
          className="w-36"
          title="Data fim"
        />
        {(search || dateFrom || dateTo || status) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch("");
              setDateFrom("");
              setDateTo("");
              setStatus("");
              setPage(0);
            }}
          >
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
                  Venda
                </th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Data
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
                  Valor
                </th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Pagamento
                </th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Status
                </th>
                <th className="text-center px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground w-16">
                  Acoes
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-border animate-pulse">
                    <td colSpan={9} className="px-4 py-4">
                      <div className="h-4 bg-muted rounded w-full" />
                    </td>
                  </tr>
                ))
              ) : sales.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-muted-foreground">
                    Nenhuma venda encontrada
                  </td>
                </tr>
              ) : (
                sales.map((sale) => {
                  const statusStr = sale.status as string;
                  const paymentDetails = sale.paymentDetails as
                    | Array<{ method: string }>
                    | null;
                  const mainMethod = paymentDetails?.[0]?.method ?? "dinheiro";
                  const paymentKey =
                    paymentDetails && paymentDetails.length > 1 ? "misto" : mainMethod;
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
                          href={`/pdv/${sale.id}`}
                          className="text-primary font-bold tabular-nums hover:underline"
                        >
                          {sale.number as string}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                        {formatDate(sale.saleDate as string)}
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
                        {formatCurrency(sale.totalAmount as number)}
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
                          variant={STATUS_VARIANTS[statusStr] ?? "default"}
                        >
                          {SALE_STATUS_LABELS[statusStr] ?? statusStr}
                        </StatusBadge>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                          <Link href={`/pdv/${sale.id}`}>
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
              Pagina {page + 1} de {totalPages} ({data?.total ?? 0} vendas)
            </span>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={page <= 0}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => p + 1)}
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
