"use client";

import { useState } from "react";
import Link from "next/link";
import { MoreHorizontal, Eye } from "lucide-react";
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
import { DataTable } from "@/components/domain/data-table";
import { StatusBadge } from "@/components/domain/status-badge";
import { useTRPC } from "@/trpc/react";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import {
  SALE_STATUSES,
  SALE_STATUS_LABELS,
  SALE_STATUS_VARIANTS,
  type SaleStatusValue,
} from "@/lib/validators/sale";

interface SaleRow {
  id: string;
  number: string;
  status: string;
  totalAmount: unknown;
  saleDate: Date | string;
  customer: { id: string; name: string; cpf: string | null } | null;
  seller: { id: string; name: string } | null;
}

function formatMoney(value: unknown): string {
  return Number(value).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function SalesHistoryTable() {
  const trpc = useTRPC();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [page, setPage] = useState(0);

  const { data: stats } = useQuery(trpc.sales.stats.queryOptions());

  const { data } = useQuery(
    trpc.sales.list.queryOptions({
      search: search || undefined,
      status: status === "all" ? undefined : (status as SaleStatusValue),
      page,
      pageSize: 20,
    }),
  );

  const columns: ColumnDef<SaleRow>[] = [
    {
      accessorKey: "number",
      header: "N. Venda",
      cell: ({ row }) => (
        <Link
          href={`/pdv/${row.original.id}`}
          className="font-mono font-medium text-primary hover:underline"
        >
          {row.original.number}
        </Link>
      ),
    },
    {
      id: "customer",
      header: "Cliente",
      cell: ({ row }) => row.original.customer?.name ?? "Sem cliente",
    },
    {
      id: "seller",
      header: "Vendedor",
      cell: ({ row }) => row.original.seller?.name ?? "—",
    },
    {
      accessorKey: "totalAmount",
      header: "Valor",
      cell: ({ row }) => (
        <span className="font-mono text-sm">
          {formatMoney(row.original.totalAmount)}
        </span>
      ),
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
      accessorKey: "saleDate",
      header: "Data",
      cell: ({ row }) =>
        new Date(row.original.saleDate as string).toLocaleDateString("pt-BR"),
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
                  Ver detalhe
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
      {/* Stats cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-sm text-muted-foreground">Vendas hoje</p>
            <p className="text-2xl font-bold">{stats?.salesToday ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-sm text-muted-foreground">Receita hoje</p>
            <p className="text-2xl font-bold">
              {formatMoney(stats?.revenueToday ?? 0)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-sm text-muted-foreground">Ticket medio</p>
            <p className="text-2xl font-bold">
              {formatMoney(stats?.averageTicket ?? 0)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-sm text-muted-foreground">Vendas (mes)</p>
            <p className="text-2xl font-bold">{stats?.salesMonth ?? 0}</p>
          </CardContent>
        </Card>
      </div>

      {/* Data table */}
      <DataTable
        columns={columns}
        data={(data?.items ?? []) as SaleRow[]}
        pageCount={data?.pageCount}
        pageIndex={page}
        pageSize={20}
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
              className="max-w-sm"
            />
            <Select
              value={status}
              onValueChange={(v) => {
                setStatus(v);
                setPage(0);
              }}
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                {SALE_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {SALE_STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      />
    </>
  );
}
