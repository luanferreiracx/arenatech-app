"use client";

import { useState } from "react";
import Link from "next/link";
import { MoreHorizontal, Eye, DollarSign, ShoppingCart, TrendingUp, Calendar, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/domain/data-table";
import { StatusBadge } from "@/components/domain/status-badge";
import { EntitySelector } from "@/components/domain/entity-selector";
import { useTRPC } from "@/trpc/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import {
  SALE_STATUSES,
  SALE_STATUS_LABELS,
  SALE_STATUS_VARIANTS,
  type SaleStatusValue,
  type PaymentDetail,
} from "@/lib/validators/sale";

interface SaleRow {
  id: string;
  number: string;
  status: string;
  totalAmount: unknown;
  paymentDetails: unknown;
  saleDate: Date | string;
  itemCount: number;
  customer: { id: string; name: string; cpf: string | null } | null;
  seller: { id: string; name: string } | null;
}

function formatMoney(value: unknown): string {
  return Number(value).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function getPaymentLabel(payments: unknown): string {
  if (!payments || !Array.isArray(payments)) return "-";
  if (payments.length === 0) return "-";
  if (payments.length === 1) {
    const p = payments[0] as PaymentDetail;
    return p.method;
  }
  return "Misto";
}

function getPaymentBadgeVariant(payments: unknown): "default" | "secondary" | "outline" {
  if (!payments || !Array.isArray(payments) || payments.length === 0) return "outline";
  if (payments.length > 1) return "default";
  return "secondary";
}

export function SalesHistoryTable() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [sellerId, setSellerId] = useState<string | undefined>();
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(0);

  const { data: stats } = useQuery(trpc.sales.stats.queryOptions());

  const { data } = useQuery(
    trpc.sales.list.queryOptions({
      search: search || undefined,
      status: status === "all" ? undefined : (status as SaleStatusValue),
      sellerId,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      page,
      pageSize: 30,
    }),
  );

  // Seller search
  const searchSellers = async (q: string) => {
    const result = await queryClient.fetchQuery(
      trpc.sales.listSellers.queryOptions({ search: q }),
    );
    return result;
  };

  const columns: ColumnDef<SaleRow>[] = [
    {
      accessorKey: "number",
      header: "Venda",
      cell: ({ row }) => (
        <Link
          href={`/pdv/${row.original.id}`}
          className="font-mono font-bold text-primary hover:underline"
        >
          {row.original.number}
        </Link>
      ),
    },
    {
      accessorKey: "saleDate",
      header: "Data",
      cell: ({ row }) => {
        const d = row.original.saleDate;
        if (!d) return "-";
        return (
          <span className="whitespace-nowrap text-xs text-muted-foreground">
            {new Date(d as string).toLocaleString("pt-BR", {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        );
      },
    },
    {
      id: "customer",
      header: "Cliente",
      cell: ({ row }) => {
        const name = row.original.customer?.name;
        return (
          <span className="max-w-[200px] truncate" title={name ?? undefined}>
            {name ?? "Sem cliente"}
          </span>
        );
      },
    },
    {
      id: "seller",
      header: "Vendedor",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {row.original.seller?.name ?? "-"}
        </span>
      ),
    },
    {
      id: "itemCount",
      header: () => <span className="text-center">Itens</span>,
      cell: ({ row }) => (
        <span className="block text-center">{row.original.itemCount ?? 0}</span>
      ),
    },
    {
      accessorKey: "totalAmount",
      header: "Valor",
      cell: ({ row }) => (
        <span className="font-mono text-sm font-bold">
          {formatMoney(row.original.totalAmount)}
        </span>
      ),
    },
    {
      id: "payment",
      header: "Pagamento",
      cell: ({ row }) => {
        const label = getPaymentLabel(row.original.paymentDetails);
        return (
          <Badge variant={getPaymentBadgeVariant(row.original.paymentDetails)} className="text-[10px] font-bold uppercase">
            {label.length > 8 ? label.slice(0, 6) : label}
          </Badge>
        );
      },
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        const s = row.original.status as SaleStatusValue;
        return (
          <StatusBadge variant={SALE_STATUS_VARIANTS[s]}>
            {SALE_STATUS_LABELS[s]}
          </StatusBadge>
        );
      },
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/pdv/${row.original.id}`}>
                  <Eye className="mr-2 h-4 w-4" />
                  Detalhes
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ];

  return (
    <>
      {/* Stats cards — 5 cards like Laravel */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardContent className="pb-3 pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-extrabold">{stats?.salesToday ?? 0}</p>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Vendas Hoje
                </p>
              </div>
              <ShoppingCart className="h-5 w-5 text-muted-foreground/30" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pb-3 pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-extrabold text-green-500">
                  {formatMoney(stats?.revenueToday ?? 0)}
                </p>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Faturamento Hoje
                </p>
              </div>
              <DollarSign className="h-5 w-5 text-muted-foreground/30" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pb-3 pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-extrabold">{stats?.salesMonth ?? 0}</p>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Vendas no Mes
                </p>
              </div>
              <Calendar className="h-5 w-5 text-muted-foreground/30" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pb-3 pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-extrabold text-violet-400">
                  {formatMoney(stats?.revenueMonth ?? 0)}
                </p>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Faturamento Mes
                </p>
              </div>
              <TrendingUp className="h-5 w-5 text-muted-foreground/30" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pb-3 pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-extrabold text-pink-400">
                  {formatMoney(stats?.averageTicket ?? 0)}
                </p>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Ticket Medio
                </p>
              </div>
              <BarChart3 className="h-5 w-5 text-muted-foreground/30" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Data table */}
      <DataTable
        columns={columns}
        data={(data?.items ?? []) as SaleRow[]}
        pageCount={data?.pageCount}
        pageIndex={page}
        pageSize={30}
        onPageChange={setPage}
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="Buscar por numero, nome ou CPF do cliente..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              className="max-w-xs"
            />
            <Select
              value={status}
              onValueChange={(v) => {
                setStatus(v);
                setPage(0);
              }}
            >
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                {SALE_STATUSES.filter((s) => s !== "DRAFT").map((s) => (
                  <SelectItem key={s} value={s}>
                    {SALE_STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1">
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
              <span className="text-xs text-muted-foreground">a</span>
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
            </div>
            {(search || status !== "all" || dateFrom || dateTo || sellerId) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearch("");
                  setStatus("all");
                  setDateFrom("");
                  setDateTo("");
                  setSellerId(undefined);
                  setPage(0);
                }}
              >
                Limpar filtros
              </Button>
            )}
          </div>
        }
      />
    </>
  );
}
